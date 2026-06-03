import { mkdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { LaunchPlanResult, LaunchContext } from './types';
import type { MojangArgument, MojangDownload, MojangLibrary, MojangRule, MojangVersion } from '../MinecraftTypes';
import { AssetSyncService } from './AssetSyncService';
import { GameFileSyncService } from './GameFileSyncService';
import { NativeExtractService } from './NativeExtractService';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import { DownloadManager } from '@/launcher/DownloadManager';
import { VersionService } from '../VersionService';

export class LaunchPlanBuilder {
  private readonly gameFiles: GameFileSyncService;
  private readonly assets: AssetSyncService;
  private readonly natives = new NativeExtractService();

  constructor(
    private readonly paths: LauncherPaths,
    downloads: DownloadManager,
    private readonly versions: VersionService
  ) {
    this.gameFiles = new GameFileSyncService(paths, downloads);
    this.assets = new AssetSyncService(paths, downloads);
  }

  async build(ctx: LaunchContext): Promise<LaunchPlanResult> {
    this.throwIfAborted(ctx.signal);
    ctx.onStage?.('Resolving version metadata');
    const version = await this.versions.resolveVersion(ctx.versionId, ctx.settings);

    this.throwIfAborted(ctx.signal);
    ctx.onStage?.('Syncing libraries and client');
    await this.gameFiles.syncLibraries(
      version,
      ctx.settings,
      (library) => this.includeLibrary(library),
      ctx.onStage,
      ctx.signal
    );

    const assetsRoot = this.paths.assetsRoot(ctx.settings);
    const librariesRoot = this.paths.librariesRoot(ctx.settings);
    const versionRoot = join(this.paths.versionsRoot(ctx.settings), version.id);
    const clientJar = join(versionRoot, `${version.id}.jar`);
    const nativesDir = join(versionRoot, 'natives');
    await mkdir(nativesDir, { recursive: true });
    await this.natives.extract(version, librariesRoot, nativesDir, (library) => this.includeLibrary(library), ctx.onStage);

    this.throwIfAborted(ctx.signal);
    ctx.onStage?.('Syncing game assets');
    try {
      await this.assets.sync(version, ctx.settings, ctx.onStage, ctx.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/asset index/i.test(message)) {
        throw error;
      }
      ctx.onStage?.(`Warning: ${message} — continuing launch`);
    }

    const classpath = this.buildClasspath(version, librariesRoot, clientJar);
    const placeholders = {
      auth_player_name: ctx.account.username,
      version_name: version.id,
      game_directory: ctx.instance.gameDir,
      assets_root: assetsRoot,
      assets_index_name: version.assetIndex?.id || version.assets || version.id,
      auth_uuid: ctx.account.uuid.replace(/-/g, ''),
      auth_access_token: ctx.account.accessToken || '0',
      clientid: '',
      auth_xuid: '',
      user_type: ctx.account.kind === 'microsoft' ? 'msa' : 'legacy',
      version_type: version.type || 'release',
      natives_directory: nativesDir,
      launcher_name: 'DawnLauncher',
      launcher_version: '0.1.0',
      classpath,
      classpath_separator: delimiter,
      library_directory: librariesRoot,
      resolution_width: String(ctx.instance.resolution?.width ?? 1280),
      resolution_height: String(ctx.instance.resolution?.height ?? 720)
    };

    const features = {
      has_custom_resolution: Boolean(ctx.instance.resolution),
      is_demo_user: false,
      has_quick_plays_support: false,
      is_quick_play_singleplayer: false,
      is_quick_play_multiplayer: false,
      is_quick_play_realms: false
    };

    const jvmArgs = version.arguments?.jvm
      ? this.resolveArguments(version.arguments.jvm, placeholders, features)
      : ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'].map((arg) => this.replacePlaceholders(arg, placeholders));

    const gameArgs = version.arguments?.game
      ? this.resolveArguments(version.arguments.game, placeholders, features)
      : this.resolveLegacyGameArguments(version.minecraftArguments || '', placeholders);

    ctx.onStage?.('Launch command generated');
    return {
      version,
      javaPath: ctx.java.path,
      args: [`-Xmx${ctx.instance.ramMb}M`, '-Xms512M', ...jvmArgs, version.mainClass, ...gameArgs],
      gameDir: ctx.instance.gameDir,
      nativesDir
    };
  }

  private buildClasspath(version: MojangVersion, librariesRoot: string, clientJar: string): string {
    const entries = version.libraries
      .filter((library) => this.includeLibrary(library))
      .map((library) => library.downloads?.artifact ?? this.mavenFallback(library))
      .filter((download): download is MojangDownload => Boolean(download?.path))
      .map((download) => join(librariesRoot, download.path!));
    return [...entries, clientJar].join(delimiter);
  }

  private mavenFallback(library: MojangLibrary): MojangDownload | undefined {
    if (!library.url) return undefined;
    const [group, artifact, ver] = library.name.split(':');
    if (!group || !artifact || !ver) return undefined;
    const path = `${group.replace(/\./g, '/')}/${artifact}/${ver}/${artifact}-${ver}.jar`;
    return { path, url: `${library.url.replace(/\/$/, '')}/${path}` };
  }

  private resolveArguments(args: Array<string | MojangArgument>, placeholders: Record<string, string>, features: Record<string, boolean>): string[] {
    const output: string[] = [];
    for (const arg of args) {
      if (typeof arg === 'string') {
        output.push(this.replacePlaceholders(arg, placeholders));
        continue;
      }
      if (!this.allowRules(arg.rules, features)) continue;
      const values = Array.isArray(arg.value) ? arg.value : [arg.value];
      output.push(...values.map((value) => this.replacePlaceholders(value, placeholders)));
    }
    return output;
  }

  private resolveLegacyGameArguments(input: string, placeholders: Record<string, string>): string[] {
    return input.split(' ').filter(Boolean).map((arg) => this.replacePlaceholders(arg, placeholders));
  }

  private replacePlaceholders(input: string, placeholders: Record<string, string>): string {
    return input.replace(/\$\{([^}]+)}/g, (_, key: string) => placeholders[key] ?? '');
  }

  private includeLibrary(library: MojangLibrary): boolean {
    return this.allowRules(library.rules, {});
  }

  private allowRules(rules: MojangRule[] | undefined, features: Record<string, boolean>): boolean {
    if (!rules?.length) return true;
    
    let allowed = true;
    for (const rule of rules) {
      if (this.matchesRule(rule, features)) {
        allowed = rule.action === 'allow';
      }
    }
    return allowed;
  }

  private matchesRule(rule: MojangRule, features: Record<string, boolean>): boolean {
    if (rule.os) {
      if (rule.os.name && rule.os.name !== this.osName()) return false;
      if (rule.os.arch && !process.arch.includes(rule.os.arch)) return false;
    }
    if (rule.features) {
      for (const [name, value] of Object.entries(rule.features)) {
        if (features[name] !== value) return false;
      }
    }
    return true;
  }

  private osName(): 'windows' | 'osx' | 'linux' {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'osx';
    return 'linux';
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error('Launch cancelled');
      error.name = 'AbortError';
      throw error;
    }
  }
}
