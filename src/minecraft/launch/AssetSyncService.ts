import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LauncherSettings } from '@/types/launcher';
import type { DownloadJob } from '@/launcher/DownloadManager';
import { DownloadManager, resolveParallelDownloads } from '@/launcher/DownloadManager';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import type { AssetIndex, MojangVersion } from '../MinecraftTypes';

const MOJANG_ASSETS = 'https://resources.download.minecraft.net';
const INDEX_FETCH_TIMEOUT_MS = 15_000;

/** Optional fallbacks only — tried after Mojang. */
const ASSET_OBJECT_MIRROR_FALLBACKS = [
  'https://bmclapi2.bangbang93.com/assets',
  'https://download.mcbbs.net/assets'
];

const ASSET_SYNC_BUDGET_MS = 90_000;

function assetIndexSources(indexId: string, mojangUrl: string): string[] {
  return [
    mojangUrl,
    `${MOJANG_ASSETS}/indexes/${indexId}.json`,
    `https://bmclapi2.bangbang93.com/assets/indexes/${indexId}.json`,
    `https://download.mcbbs.net/assets/indexes/${indexId}.json`
  ];
}

export class AssetSyncService {
  constructor(
    private readonly paths: LauncherPaths,
    private readonly downloads: DownloadManager
  ) {}

  async sync(
    version: MojangVersion,
    settings: LauncherSettings,
    onStage?: (message: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!version.assetIndex) {
      return;
    }

    await this.ensureAssetIndex(version, settings, onStage, signal);

    const indexPath = join(this.paths.assetsRoot(settings), 'indexes', `${version.assetIndex.id}.json`);
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as AssetIndex;
    const jobs = Object.entries(index.objects).map(([name, object]) => {
      const prefix = object.hash.slice(0, 2);
      const path = `${prefix}/${object.hash}`;
      return {
        id: `asset:${object.hash}`,
        label: name,
        url: `${MOJANG_ASSETS}/${path}`,
        fallbackUrls: ASSET_OBJECT_MIRROR_FALLBACKS.map((base) => `${base}/${path}`),
        targetPath: join(this.paths.assetsRoot(settings), 'objects', prefix, object.hash),
        sha1: object.hash,
        size: object.size,
        cacheMode: 'hash-path' as const
      };
    });

    onStage?.(`Scanning assets: 0/${jobs.length}`);
    const { pending, cached } = await this.downloads.prefilterJobs(jobs, signal);
    onStage?.(`Assets ready: ${cached} cached, ${pending.length} to download`);

    if (!pending.length) {
      onStage?.(`Assets verified (${jobs.length}/${jobs.length})`);
      return;
    }

    const downloadBeforeLaunch = settings.performanceMode || settings.downloadAssetsBeforeLaunch === true;
    if (!downloadBeforeLaunch) {
      onStage?.(
        `Launching with ${cached}/${jobs.length} assets (${pending.length} missing — enable "Download assets before launch" in Settings to sync first)`
      );
      return;
    }

    onStage?.(`Downloading assets: 0% (0/${pending.length})`);
    const deadline = Date.now() + ASSET_SYNC_BUDGET_MS;
    let lastReported = 0;
    let lastPercent = -1;
    const completed = await this.downloads.downloadManyUntil(
      pending,
      deadline,
      resolveParallelDownloads(settings),
      (done, total) => {
        const percent = Math.round((done / total) * 100);
        if (done === total || done - lastReported >= 10 || percent > lastPercent) {
          lastReported = done;
          lastPercent = percent;
          onStage?.(`Downloading assets: ${percent}% (${done}/${total})`);
        }
      },
      signal,
      (failed) => {
        if (failed <= 3 || failed % 50 === 0) {
          onStage?.(`Asset download failures: ${failed} (still trying…)`);
        }
      }
    );

    const remaining = pending.length - completed;
    if (remaining > 0) {
      onStage?.(`Continuing launch (${remaining} assets still missing; will retry next time)`);
    } else {
      onStage?.(`Assets verified (${jobs.length}/${jobs.length})`);
    }
  }

  private async ensureAssetIndex(
    version: MojangVersion,
    settings: LauncherSettings,
    onStage?: (message: string) => void,
    signal?: AbortSignal
  ): Promise<AssetIndex> {
    const assetIndex = version.assetIndex!;
    const indexPath = join(this.paths.assetsRoot(settings), 'indexes', `${assetIndex.id}.json`);

    const cached = await this.tryReadAssetIndex(indexPath);
    if (cached) {
      onStage?.(`Using asset index ${assetIndex.id}`);
      return cached;
    }

    await unlink(indexPath).catch(() => undefined);
    await unlink(`${indexPath}.download`).catch(() => undefined);

    const sources = [...new Set(assetIndexSources(assetIndex.id, assetIndex.url))];
    let lastError: unknown;

    for (const url of sources) {
      this.throwIfAborted(signal);
      onStage?.(`Downloading asset index ${assetIndex.id} from ${new URL(url).host}`);
      try {
        await this.fetchIndexToFile(url, indexPath, signal);
        const index = await this.tryReadAssetIndex(indexPath);
        if (index) {
          onStage?.(`Asset index ${assetIndex.id} ready`);
          return index;
        }
      } catch (error) {
        if (this.isAbortError(error)) throw error;
        lastError = error;
        await unlink(indexPath).catch(() => undefined);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
    throw new Error(`Failed to download asset index ${assetIndex.id}: ${message}`);
  }

  private async fetchIndexToFile(url: string, targetPath: string, signal?: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);
    const controller = new AbortController();
    const detach = this.linkAbort(signal, controller);
    const timeout = setTimeout(
      () => controller.abort(new Error(`Asset index timeout (${INDEX_FETCH_TIMEOUT_MS / 1000}s)`)),
      INDEX_FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = await response.text();
      if (!body.trim()) {
        throw new Error('Empty asset index response');
      }
      JSON.parse(body);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, body, 'utf8');
    } finally {
      detach();
      clearTimeout(timeout);
    }
  }

  private async tryReadAssetIndex(path: string): Promise<AssetIndex | undefined> {
    if (!existsSync(path)) {
      return undefined;
    }

    try {
      const file = await stat(path);
      if (file.size === 0) {
        return undefined;
      }
      const index = JSON.parse(await readFile(path, 'utf8')) as AssetIndex;
      if (!index?.objects || typeof index.objects !== 'object') {
        return undefined;
      }
      return index;
    } catch {
      return undefined;
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error('Launch cancelled');
      error.name = 'AbortError';
      throw error;
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
  }

  private linkAbort(parent: AbortSignal | undefined, controller: AbortController): () => void {
    if (!parent) return () => undefined;
    if (parent.aborted) {
      controller.abort(parent.reason);
      return () => undefined;
    }
    const onAbort = () => controller.abort(parent.reason);
    parent.addEventListener('abort', onAbort, { once: true });
    return () => parent.removeEventListener('abort', onAbort);
  }
}
