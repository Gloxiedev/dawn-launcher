import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LauncherSettings } from '@/types/launcher';
import { DownloadManager } from '@/launcher/DownloadManager';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import { LaunchPlanBuilder } from './launch/LaunchPlanBuilder';
import type { LaunchPlan, LaunchPlanInput, MojangLibrary, MojangVersion, VersionManifest } from './MinecraftTypes';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MANIFEST_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const VERSION_METADATA_TTL_MS = 1000 * 60 * 60 * 24;

export class VersionService {
  private manifest?: VersionManifest;
  private planBuilder?: LaunchPlanBuilder;

  constructor(
    private readonly paths: LauncherPaths,
    private readonly downloads: DownloadManager
  ) {}

  private getPlanBuilder(): LaunchPlanBuilder {
    if (!this.planBuilder) {
      this.planBuilder = new LaunchPlanBuilder(this.paths, this.downloads, this);
    }
    return this.planBuilder;
  }

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
    return this.getPlanBuilder().build({
      versionId: input.versionId,
      instance: input.instance,
      account: input.account,
      java: input.java,
      settings: input.settings,
      signal: input.signal,
      onStage: input.onStage
    });
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
    const libraries = this.uniqueLibraries([...(parent.libraries ?? []), ...(version.libraries ?? [])]);
    
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
      libraries
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

  private uniqueLibraries(libraries: MojangLibrary[]): MojangLibrary[] {
    const seen = new Map<string, MojangLibrary>();
    for (const library of libraries) {
      const key = library.name;
      const existing = seen.get(key);
      if (existing) {
        seen.set(key, {
          ...existing,
          ...library,
          downloads: { ...existing.downloads, ...library.downloads },
          natives: library.natives ?? existing.natives,
          rules: library.rules ?? existing.rules
        });
      } else {
        seen.set(key, library);
      }
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

}
