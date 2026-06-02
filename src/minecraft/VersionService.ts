import extract from 'extract-zip';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { LauncherSettings } from '@/types/launcher';
import type { DownloadJob } from '@/launcher/DownloadManager';
import { DownloadManager } from '@/launcher/DownloadManager';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import type { AssetIndex, LaunchPlan, LaunchPlanInput, MojangArgument, MojangDownload, MojangLibrary, MojangRule, MojangVersion, VersionManifest } from './MinecraftTypes';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MANIFEST_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const VERSION_METADATA_TTL_MS = 1000 * 60 * 60 * 24;
const ASSET_INDEX_TTL_MS = 1000 * 60 * 60 * 24;

export class VersionService {
  private manifest?: VersionManifest;

  constructor(
    private readonly paths: LauncherPaths,
    private readonly downloads: DownloadManager
  ) {}

  async listVersions(): Promise<string[]> {
    const catalog = await this.listVersionCatalog();
    return catalog.all;
  }

  async listVersionCatalog(): Promise<{ releases: string[]; snapshots: string[]; all: string[] }> {
    const manifest = await this.getManifest();
    const releases = manifest.versions.filter((version) => version.type === 'release').map((version) => version.id);
    const snapshots = manifest.versions.filter((version) => version.type === 'snapshot').map((version) => version.id);
    return {
      releases,
      snapshots,
      all: manifest.versions.map((version) => version.id)
    };
  }

  async resolveAlias(versionId: string): Promise<string> {
    if (versionId !== 'latest-release' && versionId !== 'latest-snapshot') {
      return versionId;
    }
    const manifest = await this.getManifest();
    return versionId === 'latest-release' ? manifest.latest.release : manifest.latest.snapshot;
  }

  async createLaunchPlan(input: LaunchPlanInput): Promise<LaunchPlan> {
    this.throwIfAborted(input.signal);
    input.onStage?.('Resolving version metadata');
    const version = await this.resolveVersion(input.versionId, input.settings);
    this.throwIfAborted(input.signal);
    input.onStage?.('Verifying assets and libraries');
    await this.downloadVersionFiles(version, input.settings, input.onStage, input.signal);

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
    return this.resolveVersionInternal(versionId, settings, new Set<string>());
  }

  private async resolveVersionInternal(versionId: string, settings: LauncherSettings, seen: Set<string>): Promise<MojangVersion> {
    const resolvedId = await this.resolveAlias(versionId);
    if (seen.has(resolvedId)) {
      throw new Error(`Detected cyclic version inheritance while resolving ${resolvedId}.`);
    }
    seen.add(resolvedId);
    const version = await this.loadOrDownloadVersion(resolvedId, settings);

    if (!version.inheritsFrom) {
      return version;
    }

    const parent = await this.resolveVersionInternal(version.inheritsFrom, settings, seen);
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

    const cachePath = join(this.paths.versionsRoot(), 'version_manifest_v2.json');
    if (await this.isFresh(cachePath, MANIFEST_CACHE_TTL_MS)) {
      this.manifest = JSON.parse(await readFile(cachePath, 'utf8')) as VersionManifest;
      return this.manifest;
    }

    try {
      this.manifest = await this.fetchJsonWithTimeout<VersionManifest>(MANIFEST_URL, 20_000);
      await mkdir(this.paths.versionsRoot(), { recursive: true });
      await writeFile(cachePath, JSON.stringify(this.manifest, null, 2), 'utf8');
      return this.manifest;
    } catch (error) {
      if (existsSync(cachePath)) {
        this.manifest = JSON.parse(await readFile(cachePath, 'utf8')) as VersionManifest;
        return this.manifest;
      }
      throw error;
    }
  }

  private async loadOrDownloadVersion(versionId: string, settings: LauncherSettings): Promise<MojangVersion> {
    const versionPath = join(this.paths.versionsRoot(settings), versionId, `${versionId}.json`);
    if (existsSync(versionPath) && await this.isFresh(versionPath, VERSION_METADATA_TTL_MS)) {
      return JSON.parse(await readFile(versionPath, 'utf8')) as MojangVersion;
    }

    const manifest = await this.getManifest();
    const item = manifest.versions.find((version) => version.id === versionId);
    if (!item) {
      throw new Error(`Minecraft version ${versionId} was not found locally or in Mojang manifests.`);
    }

    try {
      const version = await this.fetchJsonWithTimeout<MojangVersion>(item.url, 20_000);
      await this.writeLocalVersion(version, settings);
      return version;
    } catch (error) {
      if (existsSync(versionPath)) {
        return JSON.parse(await readFile(versionPath, 'utf8')) as MojangVersion;
      }
      throw error;
    }
  }

  private async downloadVersionFiles(
    version: MojangVersion,
    settings: LauncherSettings,
    onStage?: (message: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.throwIfAborted(signal);
    const jobs: DownloadJob[] = [];
    const versionRoot = join(this.paths.versionsRoot(settings), version.id);
    console.log(`[VersionService] Starting downloadVersionFiles for ${version.id}`);

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

    console.log(`[VersionService] Downloading ${jobs.length} files for version ${version.id}`);
    onStage?.(`Verifying libraries: 0/${jobs.length}`);
    await this.downloads.downloadMany(jobs, settings.maxParallelDownloads, (completed, total) => {
      onStage?.(`Verifying libraries: ${completed}/${total}`);
    }, signal);
    console.log(`[VersionService] Finished downloading files for version ${version.id}`);

    if (version.assetIndex) {
      await this.downloadAssets(version, settings, onStage, signal);
    }
  }

  private async downloadAssets(
    version: MojangVersion,
    settings: LauncherSettings,
    onStage?: (message: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.throwIfAborted(signal);
    if (!version.assetIndex) {
      return;
    }

    console.log(`[VersionService] Starting asset download for ${version.assetIndex.id}`);
    const indexPath = join(this.paths.assetsRoot(settings), 'indexes', `${version.assetIndex.id}.json`);
    if (!(await this.isFresh(indexPath, ASSET_INDEX_TTL_MS)) && version.assetIndex?.url) {
      await this.downloads.download({
        id: `assets-index-refresh:${version.assetIndex.id}`,
        label: `Assets ${version.assetIndex.id}`,
        url: version.assetIndex.url,
        targetPath: indexPath,
        sha1: version.assetIndex.sha1,
        size: version.assetIndex.size
      }, signal);
    }
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

    console.log(`[VersionService] Downloading ${jobs.length} assets for ${version.assetIndex.id}`);
    onStage?.(`Downloading assets: 0% (0/${jobs.length})`);
    await this.downloads.downloadMany(jobs, settings.maxParallelDownloads, (completed, total) => {
      onStage?.(`Downloading assets: ${Math.round((completed / total) * 100)}% (${completed}/${total})`);
    }, signal);
    console.log(`[VersionService] Finished downloading assets for ${version.assetIndex.id}`);
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

  private async isFresh(path: string, ttlMs: number): Promise<boolean> {
    try {
      const file = await stat(path);
      return Date.now() - file.mtimeMs <= ttlMs;
    } catch {
      return false;
    }
  }

  private async fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs}ms: ${url}`)), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const reason = signal.reason instanceof Error ? signal.reason.message : 'Operation aborted';
      const error = new Error(reason);
      error.name = 'AbortError';
      throw error;
    }
  }
}
