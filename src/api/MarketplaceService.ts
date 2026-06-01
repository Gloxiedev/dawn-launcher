import AdmZip from 'adm-zip';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ContentKind, Instance, LauncherSettings, MarketplaceProject, MarketplaceSearchQuery } from '@/types/launcher';
import type { DownloadJob } from '@/launcher/DownloadManager';
import { DownloadManager } from '@/launcher/DownloadManager';
import { JsonDatabase } from '@/launcher/JsonDatabase';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import { InstanceService } from '@/launcher/InstanceService';

const curseForgeClassIds: Record<ContentKind, number> = {
  mod: 6,
  modpack: 4471,
  resourcepack: 12,
  shader: 6552
};

export class MarketplaceService {
  constructor(
    private readonly database: JsonDatabase,
    private readonly downloads: DownloadManager,
    private readonly paths: LauncherPaths,
    private readonly instances: InstanceService
  ) {}

  async search(query: MarketplaceSearchQuery): Promise<MarketplaceProject[]> {
    return query.provider === 'modrinth' ? this.searchModrinth(query) : this.searchCurseForge(query);
  }

  async install(project: MarketplaceProject, instanceId: string): Promise<void> {
    const data = await this.database.read();
    const instance = data.instances.find((item) => item.id === instanceId);
    if (!instance) {
      throw new Error('Instance not found.');
    }

    if (project.projectType === 'modpack') {
      if (project.provider === 'modrinth') {
        await this.installModrinth(project, instance, data.settings);
      } else {
        await this.installCurseForge(project, instance, data.settings);
      }
      return;
    }

    if (project.projectType === 'mod') {
      if (instance.loader === 'vanilla') {
        throw new Error('Cannot install mods to vanilla instances. Please install a mod loader first (Fabric, Forge, NeoForge, or Quilt).');
      }
    }

    if (project.provider === 'modrinth') {
      await this.installModrinth(project, instance, data.settings);
      return;
    }

    await this.installCurseForge(project, instance, data.settings);
  }

  private async searchModrinth(query: MarketplaceSearchQuery): Promise<MarketplaceProject[]> {
    const facets: string[][] = [[`project_type:${this.modrinthType(query.kind)}`]];
    if (query.gameVersion) {
      facets.push([`versions:${query.gameVersion}`]);
    }
    if (query.loader && query.loader !== 'vanilla' && query.kind !== 'shader' && query.kind !== 'resourcepack') {
      facets.push([`categories:${query.loader}`]);
    }

    const params = new URLSearchParams({
      query: query.query,
      limit: String(query.limit ?? 24),
      facets: JSON.stringify(facets)
    });

    const response = await fetch(`https://api.modrinth.com/v2/search?${params}`, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Modrinth search failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      hits: Array<{
        project_id: string;
        slug: string;
        title: string;
        description: string;
        author: string;
        icon_url?: string;
        downloads: number;
        follows: number;
        categories: string[];
        project_type: string;
        client_side?: MarketplaceProject['clientSide'];
        server_side?: MarketplaceProject['serverSide'];
        latest_version?: string;
      }>;
    };

    return payload.hits.map((hit) => ({
      provider: 'modrinth',
      id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      follows: hit.follows,
      categories: hit.categories,
      projectType: this.fromModrinthType(hit.project_type),
      clientSide: hit.client_side,
      serverSide: hit.server_side,
      latestVersion: hit.latest_version
    }));
  }

  private async searchCurseForge(query: MarketplaceSearchQuery): Promise<MarketplaceProject[]> {
    const apiKey = (await this.database.read()).settings.curseForgeApiKey || process.env.CURSEFORGE_API_KEY;
    if (!apiKey) {
      throw new Error('Add a CurseForge API key in Settings before using CurseForge search.');
    }

    const params = new URLSearchParams({
      gameId: '432',
      classId: String(curseForgeClassIds[query.kind]),
      searchFilter: query.query,
      pageSize: String(query.limit ?? 24),
      sortField: '2',
      sortOrder: 'desc'
    });
    if (query.gameVersion) {
      params.set('gameVersion', query.gameVersion);
    }

    const response = await fetch(`https://api.curseforge.com/v1/mods/search?${params}`, {
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey
      }
    });
    if (!response.ok) {
      throw new Error(`CurseForge search failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      data: Array<{
        id: number;
        slug: string;
        name: string;
        summary: string;
        authors?: { name: string }[];
        logo?: { thumbnailUrl?: string; url?: string };
        downloadCount: number;
        categories?: { name: string }[];
      }>;
    };

    return payload.data.map((hit) => ({
      provider: 'curseforge',
      id: String(hit.id),
      slug: hit.slug,
      title: hit.name,
      description: hit.summary,
      author: hit.authors?.map((author) => author.name).join(', '),
      iconUrl: hit.logo?.thumbnailUrl || hit.logo?.url,
      downloads: hit.downloadCount,
      categories: hit.categories?.map((category) => category.name) ?? [],
      projectType: query.kind
    }));
  }

  private async installModrinth(project: MarketplaceProject, instance: Instance, settings: LauncherSettings): Promise<void> {
    const loaders = instance.loader !== 'vanilla' ? [instance.loader] : undefined;
    const params = new URLSearchParams();
    params.set('game_versions', JSON.stringify([instance.gameVersion]));
    if (loaders && project.projectType !== 'resourcepack' && project.projectType !== 'shader') {
      params.set('loaders', JSON.stringify(loaders));
    }

    const response = await fetch(`https://api.modrinth.com/v2/project/${project.id}/version?${params}`, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Modrinth versions failed (${response.status}).`);
    }

    const versions = (await response.json()) as Array<{
      id: string;
      name: string;
      version_number: string;
      files: Array<{ url: string; filename: string; primary: boolean; hashes?: { sha1?: string }; size?: number }>;
    }>;
    const version = versions[0];
    const file = version?.files.find((item) => item.primary) ?? version?.files[0];
    if (!file) {
      throw new Error('No compatible Modrinth file found for this instance.');
    }

    const tempPath = join(this.paths.downloadsRoot(settings), 'marketplace', file.filename);
    await this.downloads.download({
      id: `modrinth:${project.id}:${version.id}`,
      label: `${project.title} ${version.version_number}`,
      url: file.url,
      targetPath: tempPath,
      sha1: file.hashes?.sha1,
      size: file.size
    });

    if (project.projectType === 'modpack' && file.filename.endsWith('.mrpack')) {
      await this.installMrPack(tempPath, instance, settings);
      return;
    }

    const targetDir = this.instances.getContentDir(instance, project.projectType);
    await mkdir(targetDir, { recursive: true });
    await import('node:fs/promises').then(({ copyFile }) => copyFile(tempPath, join(targetDir, file.filename)));
  }

  private async installCurseForge(project: MarketplaceProject, instance: Instance, settings: LauncherSettings): Promise<void> {
    const apiKey = settings.curseForgeApiKey || process.env.CURSEFORGE_API_KEY;
    if (!apiKey) {
      throw new Error('Add a CurseForge API key in Settings before installing CurseForge content.');
    }

    const params = new URLSearchParams({
      gameVersion: instance.gameVersion,
      pageSize: '20'
    });

    const response = await fetch(`https://api.curseforge.com/v1/mods/${project.id}/files?${params}`, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey }
    });
    if (!response.ok) {
      throw new Error(`CurseForge files failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      data: Array<{ id: number; displayName: string; fileName: string; downloadUrl?: string; fileLength?: number; hashes?: { algo: number; value: string }[] }>;
    };
    const file = payload.data.find((item) => item.downloadUrl) ?? payload.data[0];
    if (!file?.downloadUrl) {
      throw new Error('CurseForge did not expose a direct download URL for this file.');
    }

    const targetDir = this.instances.getContentDir(instance, project.projectType);
    const sha1 = file.hashes?.find((hash) => hash.algo === 1)?.value;
    await this.downloads.download({
      id: `curseforge:${project.id}:${file.id}`,
      label: file.displayName,
      url: file.downloadUrl,
      targetPath: join(targetDir, file.fileName),
      sha1,
      size: file.fileLength
    });
  }

  private async installMrPack(path: string, instance: Instance, settings: LauncherSettings): Promise<void> {
    const zip = new AdmZip(path);
    const indexEntry = zip.getEntry('modrinth.index.json');
    if (!indexEntry) {
      throw new Error('Invalid Modrinth pack: missing modrinth.index.json.');
    }

    const index = JSON.parse(indexEntry.getData().toString('utf8')) as {
      dependencies?: Record<string, string>;
      files?: Array<{ path: string; downloads: string[]; hashes?: { sha1?: string }; fileSize?: number }>;
    };

    for (const entry of zip.getEntries().filter((item) => item.entryName.startsWith('overrides/') && !item.isDirectory)) {
      const relative = entry.entryName.slice('overrides/'.length);
      const target = join(instance.gameDir, relative);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, entry.getData());
    }

    const jobs: DownloadJob[] = (index.files ?? [])
      .filter((file) => file.downloads[0])
      .map((file) => ({
        id: `mrpack:${basename(file.path)}:${file.hashes?.sha1 ?? file.downloads[0]}`,
        label: basename(file.path),
        url: file.downloads[0],
        targetPath: join(instance.gameDir, file.path),
        sha1: file.hashes?.sha1,
        size: file.fileSize
      }));

    await this.downloads.downloadMany(jobs, settings.maxParallelDownloads);

    await this.instances.update(instance.id, {
      gameVersion: index.dependencies?.minecraft ?? instance.gameVersion,
      loader:
        index.dependencies?.['fabric-loader'] ? 'fabric' : index.dependencies?.forge ? 'forge' : index.dependencies?.neoforge ? 'neoforge' : index.dependencies?.['quilt-loader'] ? 'quilt' : instance.loader,
      loaderVersion:
        index.dependencies?.['fabric-loader'] ?? index.dependencies?.forge ?? index.dependencies?.neoforge ?? index.dependencies?.['quilt-loader'] ?? instance.loaderVersion
    });

    await rm(path, { force: true }).catch(() => undefined);
  }

  private modrinthType(kind: ContentKind): string {
    if (kind === 'resourcepack') {
      return 'resourcepack';
    }
    return kind;
  }

  private fromModrinthType(type: string): ContentKind {
    if (type === 'resourcepack') {
      return 'resourcepack';
    }
    if (type === 'shader') {
      return 'shader';
    }
    if (type === 'modpack') {
      return 'modpack';
    }
    return 'mod';
  }
}
