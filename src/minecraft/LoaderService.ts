import { XMLParser } from 'fast-xml-parser';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Instance, LauncherSettings, LoaderKind } from '@/types/launcher';
import { DownloadManager } from '@/launcher/DownloadManager';
import { InstanceService } from '@/launcher/InstanceService';
import { JavaService } from '@/launcher/JavaService';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import type { MojangVersion } from './MinecraftTypes';
import { VersionService } from './VersionService';

const execFileAsync = promisify(execFile);

export class LoaderService {
  constructor(
    private readonly versions: VersionService,
    private readonly downloads: DownloadManager,
    private readonly java: JavaService,
    private readonly paths: LauncherPaths,
    private readonly instances: InstanceService
  ) {}

  async install(instance: Instance, settings: LauncherSettings): Promise<Instance> {
    if (instance.loader === 'vanilla') {
      return this.instances.update(instance.id, { launchVersionId: undefined, loaderVersion: undefined });
    }

    if (instance.loader === 'fabric') {
      return this.installFabricLike(instance, settings, 'fabric');
    }

    if (instance.loader === 'quilt') {
      return this.installFabricLike(instance, settings, 'quilt');
    }

    return this.installForgeLike(instance, settings, instance.loader);
  }

  private async installFabricLike(instance: Instance, settings: LauncherSettings, kind: 'fabric' | 'quilt'): Promise<Instance> {
    const gameVersion = await this.versions.resolveAlias(instance.gameVersion);
    const loaderVersion = instance.loaderVersion || (await this.latestFabricLikeLoader(gameVersion, kind));
    const url =
      kind === 'fabric'
        ? `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loaderVersion}/profile/json`
        : `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}/${loaderVersion}/profile/json`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`${kind} profile install failed (${response.status}).`);
    }

    const profile = (await response.json()) as MojangVersion;
    await this.versions.writeLocalVersion(profile, settings);
    return this.instances.update(instance.id, {
      loaderVersion,
      launchVersionId: profile.id
    });
  }

  private async latestFabricLikeLoader(gameVersion: string, kind: 'fabric' | 'quilt'): Promise<string> {
    const url =
      kind === 'fabric'
        ? `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`
        : `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Unable to find ${kind} loaders for Minecraft ${gameVersion}.`);
    }

    const payload = (await response.json()) as Array<{ loader: { version: string }; version?: string }>;
    const first = payload[0];
    const version = first?.loader?.version || first?.version;
    if (!version) {
      throw new Error(`No ${kind} loader is available for Minecraft ${gameVersion}.`);
    }
    return version;
  }

  private async installForgeLike(instance: Instance, settings: LauncherSettings, kind: Extract<LoaderKind, 'forge' | 'neoforge'>): Promise<Instance> {
    const gameVersion = await this.versions.resolveAlias(instance.gameVersion);
    const coordinate = await this.resolveForgeLikeVersion({ ...instance, gameVersion }, kind);
    const artifactName = kind === 'forge' ? `forge-${coordinate}` : `neoforge-${coordinate}`;
    const base =
      kind === 'forge'
        ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${coordinate}`
        : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${coordinate}`;
    const installerPath = join(this.paths.downloadsRoot(settings), `${artifactName}-installer.jar`);
    await mkdir(this.paths.downloadsRoot(settings), { recursive: true });
    await this.downloads.download({
      id: `${kind}:installer:${coordinate}`,
      label: `${kind} ${coordinate} installer`,
      url: `${base}/${artifactName}-installer.jar`,
      targetPath: installerPath
    });

    const runtime = await this.java.pick(settings, gameVersion);
    await execFileAsync(runtime.path, ['-jar', installerPath, '--installClient', this.paths.minecraftRoot(settings)], {
      cwd: this.paths.minecraftRoot(settings),
      timeout: 1000 * 60 * 5
    });

    const launchVersionId = kind === 'forge' ? `${gameVersion}-forge-${coordinate.split('-')[1] ?? coordinate}` : `neoforge-${coordinate}`;
    return this.instances.update(instance.id, {
      loaderVersion: coordinate,
      launchVersionId
    });
  }

  private async resolveForgeLikeVersion(instance: Instance, kind: 'forge' | 'neoforge'): Promise<string> {
    if (instance.loaderVersion) {
      return kind === 'forge' && !instance.loaderVersion.startsWith(instance.gameVersion)
        ? `${instance.gameVersion}-${instance.loaderVersion}`
        : instance.loaderVersion;
    }

    const metadataUrl =
      kind === 'forge'
        ? 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
        : 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

    const response = await fetch(metadataUrl, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Unable to fetch ${kind} metadata (${response.status}).`);
    }

    const parser = new XMLParser();
    const xml = parser.parse(await response.text()) as { metadata: { versioning: { versions: { version: string[] | string } } } };
    const versions = xml.metadata.versioning.versions.version;
    const all = Array.isArray(versions) ? versions : [versions];
    const matching = kind === 'forge' ? all.filter((version) => version.startsWith(`${instance.gameVersion}-`)) : all;
    const selected = matching.at(-1);
    if (!selected) {
      throw new Error(`No ${kind} version found for Minecraft ${instance.gameVersion}.`);
    }
    return selected;
  }
}
