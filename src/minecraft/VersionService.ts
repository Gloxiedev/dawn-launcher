import extract from 'extract-zip';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { LauncherSettings } from '@/types/launcher';
import type { DownloadJob } from '@/launcher/DownloadManager';
import { DownloadManager } from '@/launcher/DownloadManager';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import type { AssetIndex, LaunchPlan, LaunchPlanInput, MojangArgument, MojangDownload, MojangLibrary, MojangRule, MojangVersion, VersionManifest } from './MinecraftTypes';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export class VersionService {
  private manifest?: VersionManifest;

  constructor(
    private readonly paths: LauncherPaths,
    private readonly downloads: DownloadManager
  ) {}

  async listVersions(): Promise<string[]> {
    const manifest = await this.getManifest();
    return manifest.versions.map((version) => version.id);
  }

  async resolveAlias(versionId: string): Promise<string> {
    if (versionId !== 'latest-release' && versionId !== 'latest-snapshot') {
      return versionId;
    }
    const manifest = await this.getManifest();
    return versionId === 'latest-release' ? manifest.latest.release : manifest.latest.snapshot;
  }

  async createLaunchPlan(input: LaunchPlanInput): Promise<LaunchPlan> {
    const version = await this.resolveVersion(input.versionId, input.settings);
    await this.downloadVersionFiles(version, input.settings);

    const assetsRoot = this.paths.assetsRoot(input.settings);
    const librariesRoot = this.paths.librariesRoot(input.settings);
    const versionRoot = join(this.paths.versionsRoot(input.settings), version.id);
    const clientJar = join(versionRoot, `${version.id}.jar`);
    const nativesDir = join(versionRoot, 'natives');
    await mkdir(nativesDir, { recursive: true });
    await this.extractNatives(version, librariesRoot, nativesDir);

    const classpath = this.buildClasspath(version, librariesRoot, clientJar);
    const placeholders = {
      auth_player_name: input.account.username,
      version_name: version.id,
      game_directory: input.instance.gameDir,
      assets_root: assetsRoot,
      assets_index_name: version.assetIndex?.id || version.assets || version.id,
      auth_uuid: input.account.uuid.replace(/-/g, ''),
      auth_access_token: input.account.accessToken || '0',
      clientid: '',
      auth_xuid: '',
      user_type: input.account.kind === 'microsoft' ? 'msa' : 'legacy',
      version_type: version.type || 'release',
      natives_directory: nativesDir,
      launcher_name: 'DawnLauncher',
      launcher_version: '0.1.0',
      classpath,
      classpath_separator: delimiter,
      library_directory: librariesRoot,
      resolution_width: String(input.instance.resolution?.width ?? 1280),
      resolution_height: String(input.instance.resolution?.height ?? 720)
    };

    const features = {
      has_custom_resolution: Boolean(input.instance.resolution),
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

    const memoryArgs = [`-Xmx${input.instance.ramMb}M`, '-Xms512M'];
    return {
      version,
      javaPath: input.java.path,
      args: [...memoryArgs, ...jvmArgs, version.mainClass, ...gameArgs],
      gameDir: input.instance.gameDir,
      nativesDir
    };
  }

  async writeLocalVersion(version: MojangVersion, settings: LauncherSettings): Promise<string> {
    const dir = join(this.paths.versionsRoot(settings), version.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${version.id}.json`), JSON.stringify(version, null, 2), 'utf8');
    return version.id;
  }

  async resolveVersion(versionId: string, settings: LauncherSettings): Promise<MojangVersion> {
    const resolvedId = await this.resolveAlias(versionId);
    const version = await this.loadOrDownloadVersion(resolvedId, settings);

    if (!version.inheritsFrom) {
      return version;
    }

    const parent = await this.resolveVersion(version.inheritsFrom, settings);
    return {
      ...parent,
      ...version,
      downloads: { ...parent.downloads, ...version.downloads },
      assetIndex: version.assetIndex ?? parent.assetIndex,
      assets: version.assets ?? parent.assets,
      javaVersion: version.javaVersion ?? parent.javaVersion,
      mainClass: version.mainClass ?? parent.mainClass,
      arguments: {
        game: [...(parent.arguments?.game ?? []), ...(version.arguments?.game ?? [])],
        jvm: [...(parent.arguments?.jvm ?? []), ...(version.arguments?.jvm ?? [])]
      },
      minecraftArguments: version.minecraftArguments ?? parent.minecraftArguments,
      libraries: this.uniqueLibraries([...(parent.libraries ?? []), ...(version.libraries ?? [])])
    };
  }

  async requiredJavaMajor(versionId: string, settings: LauncherSettings): Promise<number | undefined> {
    const version = await this.resolveVersion(versionId, settings);
    return version.javaVersion?.majorVersion;
  }

  private async getManifest(): Promise<VersionManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    const response = await fetch(MANIFEST_URL, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Unable to fetch Minecraft version manifest (${response.status}).`);
    }

    this.manifest = (await response.json()) as VersionManifest;
    return this.manifest;
  }

  private async loadOrDownloadVersion(versionId: string, settings: LauncherSettings): Promise<MojangVersion> {
    const versionPath = join(this.paths.versionsRoot(settings), versionId, `${versionId}.json`);
    if (existsSync(versionPath)) {
      return JSON.parse(await readFile(versionPath, 'utf8')) as MojangVersion;
    }

    const manifest = await this.getManifest();
    const item = manifest.versions.find((version) => version.id === versionId);
    if (!item) {
      throw new Error(`Minecraft version ${versionId} was not found locally or in Mojang manifests.`);
    }

    const response = await fetch(item.url, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Unable to fetch Minecraft ${versionId} metadata (${response.status}).`);
    }

    const version = (await response.json()) as MojangVersion;
    await this.writeLocalVersion(version, settings);
    return version;
  }

  private async downloadVersionFiles(version: MojangVersion, settings: LauncherSettings): Promise<void> {
    const jobs: DownloadJob[] = [];
    const versionRoot = join(this.paths.versionsRoot(settings), version.id);

    if (version.downloads?.client) {
      jobs.push(this.downloadJob(`client:${version.id}`, `Minecraft ${version.id} client`, version.downloads.client, join(versionRoot, `${version.id}.jar`)));
    }

    if (version.assetIndex) {
      const indexPath = join(this.paths.assetsRoot(settings), 'indexes', `${version.assetIndex.id}.json`);
      jobs.push(this.downloadJob(`assets-index:${version.assetIndex.id}`, `Assets ${version.assetIndex.id}`, version.assetIndex, indexPath));
    }

    for (const library of version.libraries.filter((item) => this.includeLibrary(item))) {
      const artifact = library.downloads?.artifact ?? this.mavenFallbackArtifact(library);
      if (artifact?.url && artifact.path) {
        jobs.push(this.downloadJob(`library:${library.name}`, library.name, artifact, join(this.paths.librariesRoot(settings), artifact.path)));
      }

      const native = this.nativeDownload(library);
      if (native?.url && native.path) {
        jobs.push(this.downloadJob(`native:${library.name}`, `${library.name} natives`, native, join(this.paths.librariesRoot(settings), native.path)));
      }
    }

    await this.downloads.downloadMany(jobs, settings.maxParallelDownloads);

    if (version.assetIndex) {
      await this.downloadAssets(version, settings);
    }
  }

  private async downloadAssets(version: MojangVersion, settings: LauncherSettings): Promise<void> {
    if (!version.assetIndex) {
      return;
    }

    const indexPath = join(this.paths.assetsRoot(settings), 'indexes', `${version.assetIndex.id}.json`);
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as AssetIndex;
    const jobs = Object.entries(index.objects).map(([name, object]) => {
      const prefix = object.hash.slice(0, 2);
      return {
        id: `asset:${object.hash}`,
        label: name,
        url: `https://resources.download.minecraft.net/${prefix}/${object.hash}`,
        targetPath: join(this.paths.assetsRoot(settings), 'objects', prefix, object.hash),
        sha1: object.hash,
        size: object.size
      };
    });

    await this.downloads.downloadMany(jobs, settings.maxParallelDownloads);
  }

  private async extractNatives(version: MojangVersion, librariesRoot: string, nativesDir: string): Promise<void> {
    for (const library of version.libraries.filter((item) => this.includeLibrary(item))) {
      const native = this.nativeDownload(library);
      if (!native?.path) {
        continue;
      }

      const source = join(librariesRoot, native.path);
      if (!existsSync(source)) {
        continue;
      }

      await extract(source, { dir: nativesDir });
    }
  }

  private buildClasspath(version: MojangVersion, librariesRoot: string, clientJar: string): string {
    const entries = version.libraries
      .filter((library) => this.includeLibrary(library))
      .map((library) => library.downloads?.artifact ?? this.mavenFallbackArtifact(library))
      .filter((download): download is MojangDownload => Boolean(download?.path))
      .map((download) => join(librariesRoot, download.path!));

    return [...entries, clientJar].join(delimiter);
  }

  private resolveArguments(args: Array<string | MojangArgument>, placeholders: Record<string, string>, features: Record<string, boolean>): string[] {
    const output: string[] = [];
    for (const arg of args) {
      if (typeof arg === 'string') {
        output.push(this.replacePlaceholders(arg, placeholders));
        continue;
      }

      if (!this.allowRules(arg.rules, features)) {
        continue;
      }

      const values = Array.isArray(arg.value) ? arg.value : [arg.value];
      output.push(...values.map((value) => this.replacePlaceholders(value, placeholders)));
    }
    return output;
  }

  private resolveLegacyGameArguments(input: string, placeholders: Record<string, string>): string[] {
    return input
      .split(' ')
      .filter(Boolean)
      .map((arg) => this.replacePlaceholders(arg, placeholders));
  }

  private replacePlaceholders(input: string, placeholders: Record<string, string>): string {
    return input.replace(/\$\{([^}]+)}/g, (_, key: string) => placeholders[key] ?? '');
  }

  private includeLibrary(library: MojangLibrary): boolean {
    return this.allowRules(library.rules, {});
  }

  private allowRules(rules: MojangRule[] | undefined, features: Record<string, boolean>): boolean {
    if (!rules?.length) {
      return true;
    }

    let allowed = false;
    for (const rule of rules) {
      if (this.matchesRule(rule, features)) {
        allowed = rule.action === 'allow';
      }
    }
    return allowed;
  }

  private matchesRule(rule: MojangRule, features: Record<string, boolean>): boolean {
    if (rule.os) {
      if (rule.os.name && rule.os.name !== this.osName()) {
        return false;
      }
      if (rule.os.arch && !process.arch.includes(rule.os.arch)) {
        return false;
      }
    }

    if (rule.features) {
      for (const [name, value] of Object.entries(rule.features)) {
        if (features[name] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  private osName(): 'windows' | 'osx' | 'linux' {
    if (process.platform === 'win32') {
      return 'windows';
    }
    if (process.platform === 'darwin') {
      return 'osx';
    }
    return 'linux';
  }

  private nativeDownload(library: MojangLibrary): MojangDownload | undefined {
    const nativeClassifier = library.natives?.[this.osName()]?.replace('${arch}', process.arch === 'x64' ? '64' : '32');
    return nativeClassifier ? library.downloads?.classifiers?.[nativeClassifier] : undefined;
  }

  private downloadJob(id: string, label: string, download: MojangDownload, targetPath: string): DownloadJob {
    return {
      id,
      label,
      url: download.url,
      targetPath,
      sha1: download.sha1,
      size: download.size
    };
  }

  private mavenFallbackArtifact(library: MojangLibrary): MojangDownload | undefined {
    if (!library.url) {
      return undefined;
    }

    const [group, artifact, version] = library.name.split(':');
    if (!group || !artifact || !version) {
      return undefined;
    }

    const path = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
    return {
      path,
      url: `${library.url.replace(/\/$/, '')}/${path}`
    };
  }

  private uniqueLibraries(libraries: MojangLibrary[]): MojangLibrary[] {
    const seen = new Map<string, MojangLibrary>();
    for (const library of libraries) {
      seen.set(`${library.name}:${JSON.stringify(library.natives ?? {})}`, library);
    }
    return [...seen.values()];
  }
}
