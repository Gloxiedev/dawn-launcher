import { join } from 'node:path';
import type { LauncherSettings } from '@/types/launcher';
import type { DownloadJob } from '@/launcher/DownloadManager';
import { DownloadManager, resolveParallelDownloads } from '@/launcher/DownloadManager';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import type { MojangDownload, MojangLibrary, MojangVersion } from '../MinecraftTypes';

const MOJANG_LIBRARIES = 'https://libraries.minecraft.net/';

const MAVEN_MIRROR_FALLBACKS = [
  'https://bmclapi2.bangbang93.com/maven',
  'https://download.mcbbs.net/maven'
];

export class GameFileSyncService {
  constructor(
    private readonly paths: LauncherPaths,
    private readonly downloads: DownloadManager
  ) {}

  async syncLibraries(
    version: MojangVersion,
    settings: LauncherSettings,
    includeLibrary: (library: MojangLibrary) => boolean,
    onStage?: (message: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const jobs: DownloadJob[] = [];
    const versionRoot = join(this.paths.versionsRoot(settings), version.id);

    if (version.downloads?.client) {
      jobs.push(this.job(`client:${version.id}`, `Minecraft ${version.id} client`, version.downloads.client, join(versionRoot, `${version.id}.jar`)));
    }

    let nativeCount = 0;
    for (const library of version.libraries.filter(includeLibrary)) {
      const artifact = library.downloads?.artifact ?? this.mavenFallback(library);
      if (artifact?.url && artifact.path) {
        jobs.push(this.job(`library:${library.name}`, library.name, artifact, join(this.paths.librariesRoot(settings), artifact.path)));
      }

      const native = this.nativeDownload(library);
      if (native?.url && native.path) {
        jobs.push(this.job(`native:${library.name}`, `${library.name} natives`, native, join(this.paths.librariesRoot(settings), native.path)));
        nativeCount += 1;
      }
    }

    onStage?.(`Scanning libraries: 0/${jobs.length} (${nativeCount} natives)`);
    const { pending, cached } = await this.downloads.prefilterJobs(jobs, signal);
    onStage?.(`Libraries ready: ${cached} cached, ${pending.length} to download`);

    if (!pending.length) {
      onStage?.(`Libraries verified (${jobs.length}/${jobs.length})`);
      return;
    }

    const parallel = resolveParallelDownloads(settings);
    let done = 0;
    await this.downloads.downloadMany(
      pending,
      parallel,
      (completed, total) => {
        done = completed;
        onStage?.(`Downloading libraries: ${completed}/${total}`);
      },
      signal
    );
    onStage?.(`Libraries verified (${cached + done}/${jobs.length})`);
  }

  private job(id: string, label: string, download: MojangDownload, targetPath: string): DownloadJob {
    return {
      id,
      label,
      url: download.url,
      fallbackUrls: this.mavenFallbackUrls(download.url),
      targetPath,
      sha1: download.sha1,
      size: download.size,
      cacheMode: download.sha1 ? 'verify-sha1' : 'size-only'
    };
  }

  private mavenFallbackUrls(url: string): string[] {
    if (!url.startsWith(MOJANG_LIBRARIES)) {
      return [];
    }
    const path = url.slice(MOJANG_LIBRARIES.length);
    return MAVEN_MIRROR_FALLBACKS.map((base) => `${base}/${path}`);
  }

  private mavenFallback(library: MojangLibrary): MojangDownload | undefined {
    if (!library.url) return undefined;
    const [group, artifact, version] = library.name.split(':');
    if (!group || !artifact || !version) return undefined;
    const path = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
    return { path, url: `${library.url.replace(/\/$/, '')}/${path}` };
  }

  private nativeDownload(library: MojangLibrary): MojangDownload | undefined {
    const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
    const nativeClassifier = library.natives?.[os]?.replace('${arch}', process.arch === 'x64' ? '64' : '32');
    if (!nativeClassifier) return undefined;

    const classifierDownload = library.downloads?.classifiers?.[nativeClassifier];
    if (classifierDownload) {
      return classifierDownload;
    }

    if (!library.url) return undefined;
    const [group, artifact, version] = library.name.split(':');
    if (!group || !artifact || !version) return undefined;
    const path = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}-${nativeClassifier}.jar`;
    return { path, url: `${library.url.replace(/\/$/, '')}/${path}` };
  }
}
