import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { finished } from 'node:stream/promises';
import { EventEmitter } from 'node:events';
import type { DownloadProgress } from '@/types/launcher';
import { friendlyErrorMessage } from './errors';
import type { Logger } from './Logger';

export interface DownloadJob {
  id: string;
  label: string;
  url: string;
  fallbackUrls?: string[];
  targetPath: string;
  sha1?: string;
  size?: number;
  /** size-only | hash-path: stat-only on launch. verify-sha1: full disk hash (slow). */
  cacheMode?: 'size-only' | 'hash-path' | 'verify-sha1';
}

export interface DownloadOptions {
  hardTimeoutMs?: number;
  idleTimeoutMs?: number;
  connectTimeoutMs?: number;
  maxRetries?: number;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 400;
export const DEFAULT_PARALLEL_DOWNLOADS = 16;

/** Use settings value when set and positive; otherwise fallback. */
export function resolveParallelDownloads(
  settings: { maxParallelDownloads?: number },
  fallback = DEFAULT_PARALLEL_DOWNLOADS
): number {
  const value = settings.maxParallelDownloads;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}
const DOWNLOAD_HARD_TIMEOUT_MS = 90_000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 12_000;
const PREFILTER_CONCURRENCY = 128;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DownloadManager extends EventEmitter {
  private readonly jobs = new Map<string, DownloadProgress>();

  constructor(private readonly logger?: Logger) {
    super();
  }

  list(): DownloadProgress[] {
    return [...this.jobs.values()].map((job) => ({ ...job }));
  }

  /** Fast parallel scan — only download files that are missing or invalid. */
  async prefilterJobs(jobs: DownloadJob[], signal?: AbortSignal): Promise<{ pending: DownloadJob[]; cached: number }> {
    const pending: DownloadJob[] = [];
    let cached = 0;
    let nextIndex = 0;
    const workers = Math.min(PREFILTER_CONCURRENCY, Math.max(1, jobs.length));

    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          this.throwIfAborted(signal);
          const index = nextIndex++;
          if (index >= jobs.length) return;
          if (await this.isJobCached(jobs[index], signal)) {
            cached += 1;
          } else {
            pending.push(jobs[index]);
          }
        }
      })
    );

    return { pending, cached };
  }

  async download(job: DownloadJob, signal?: AbortSignal, options?: DownloadOptions): Promise<string> {
    this.throwIfAborted(signal);
    if (await this.isJobCached(job, signal)) {
      return job.targetPath;
    }

    let lastError: unknown;
    const sources = [job.url, ...(job.fallbackUrls ?? [])];
    const maxRetries = options?.maxRetries ?? MAX_RETRIES;

    for (let round = 0; round < maxRetries; round++) {
      this.throwIfAborted(signal);
      for (const sourceUrl of sources) {
        this.throwIfAborted(signal);
        try {
          return await this.downloadOnce(job, sourceUrl, signal, options);
        } catch (error) {
          if (this.isAbortError(error)) throw error;
          lastError = error;
          await unlink(`${job.targetPath}.download`).catch(() => undefined);
        }
      }
      if (round < maxRetries - 1) {
        await this.cleanupPartialDownload(job);
        await sleep(BASE_BACKOFF_MS * 2 ** round);
      }
    }

    const message = friendlyErrorMessage(lastError);
    this.fail(job, message);
    throw new Error(`${message} (${job.label})`);
  }

  /** Download a small pending set with per-file status (libraries/client). */
  async downloadPending(
    jobs: DownloadJob[],
    signal?: AbortSignal,
    options?: DownloadOptions & { onFileStart?: (label: string) => void }
  ): Promise<void> {
    for (const job of jobs) {
      this.throwIfAborted(signal);
      options?.onFileStart?.(job.label);
      await this.download(job, signal, options);
    }
  }

  async downloadMany(
    jobs: DownloadJob[],
    maxParallel = DEFAULT_PARALLEL_DOWNLOADS,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.throwIfAborted(signal);
    const seen = new Set<string>();
    const queue = jobs.filter((job) => {
      const key = job.targetPath.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!queue.length) return;

    const concurrency = Math.max(1, Math.floor(maxParallel));
    let nextIndex = 0;
    let completed = 0;

    const worker = async () => {
      for (;;) {
        this.throwIfAborted(signal);
        const index = nextIndex++;
        if (index >= queue.length) return;
        await this.download(queue[index], signal);
        completed += 1;
        onProgress?.(completed, queue.length);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  }

  /** Download until deadline; returns how many jobs completed. */
  async downloadManyUntil(
    jobs: DownloadJob[],
    deadlineMs: number,
    maxParallel = DEFAULT_PARALLEL_DOWNLOADS,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal,
    onFailures?: (failureCount: number) => void
  ): Promise<number> {
    this.throwIfAborted(signal);
    const seen = new Set<string>();
    const queue = jobs.filter((job) => {
      const key = job.targetPath.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!queue.length) return 0;

    const concurrency = Math.max(1, Math.floor(maxParallel));
    let nextIndex = 0;
    let completed = 0;
    let failures = 0;

    const worker = async () => {
      for (;;) {
        if (Date.now() >= deadlineMs) return;
        this.throwIfAborted(signal);
        const index = nextIndex++;
        if (index >= queue.length) return;
        try {
          await this.download(queue[index], signal, {
            hardTimeoutMs: 25_000,
            idleTimeoutMs: 8_000,
            connectTimeoutMs: 8_000
          });
          completed += 1;
          onProgress?.(completed, queue.length);
        } catch (error) {
          if (this.isAbortError(error)) throw error;
          failures += 1;
          onFailures?.(failures);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
    return completed;
  }

  private async isJobCached(job: DownloadJob, signal?: AbortSignal): Promise<boolean> {
    try {
      this.throwIfAborted(signal);
      const file = await stat(job.targetPath);
      if (file.size === 0) return false;
      if (job.size && file.size !== job.size) return false;

      if (!job.sha1 || job.cacheMode === 'size-only') return true;

      if (job.cacheMode === 'hash-path') {
        const name = basename(job.targetPath);
        if (name.toLowerCase() === job.sha1.toLowerCase()) {
          return true;
        }
      }

      if (job.cacheMode !== 'verify-sha1') {
        return true;
      }

      const hash = await this.sha1File(job.targetPath, signal);
      return hash === job.sha1;
    } catch {
      return false;
    }
  }

  private async downloadOnce(
    job: DownloadJob,
    sourceUrl: string,
    signal?: AbortSignal,
    options?: DownloadOptions
  ): Promise<string> {
    this.throwIfAborted(signal);
    await mkdir(dirname(job.targetPath), { recursive: true });

    const tempPath = `${job.targetPath}.download`;
    await unlink(tempPath).catch(() => undefined);

    this.emitProgress({
      id: job.id,
      label: job.label,
      url: job.url,
      targetPath: job.targetPath,
      state: 'running',
      receivedBytes: 0,
      totalBytes: job.size,
      speedBytesPerSecond: 0
    });

    const controller = new AbortController();
    const detachParentAbort = this.linkAbortSignal(signal, controller);
    const hardMs = options?.hardTimeoutMs ?? DOWNLOAD_HARD_TIMEOUT_MS;
    const idleMs = options?.idleTimeoutMs ?? DOWNLOAD_IDLE_TIMEOUT_MS;
    const hardTimeout = setTimeout(
      () => controller.abort(new Error(`Download hard timeout: ${job.label}`)),
      hardMs
    );
    let idleTimeout: NodeJS.Timeout | undefined;
    const refreshIdleTimeout = () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(
        () => controller.abort(new Error(`Download stalled: ${job.label}`)),
        idleMs
      );
    };
    refreshIdleTimeout();

    const connectMs = options?.connectTimeoutMs ?? 15_000;
    const connectTimeout = setTimeout(
      () => controller.abort(new Error(`Connection timeout: ${job.label}`)),
      connectMs
    );

    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to download ${job.label}: ${message}`);
    } finally {
      clearTimeout(connectTimeout);
    }

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} for ${job.label}`);
    }

    const totalBytes = Number(response.headers.get('content-length') || job.size || 0) || undefined;
    const writer = createWriteStream(tempPath, { flags: 'wx' });
    const reader = response.body.getReader();
    const hash = createHash('sha1');
    let receivedBytes = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.throwIfAborted(signal);
        refreshIdleTimeout();
        const buffer = Buffer.from(value);
        hash.update(buffer);
        if (!writer.write(buffer)) {
          await new Promise<void>((resolve) => writer.once('drain', resolve));
        }
        receivedBytes += buffer.byteLength;
      }
    } catch (error) {
      writer.destroy();
      await unlink(tempPath).catch(() => undefined);
      throw error;
    } finally {
      detachParentAbort();
      clearTimeout(hardTimeout);
      if (idleTimeout) clearTimeout(idleTimeout);
    }

    await finished(writer);
    const fileStat = await stat(tempPath);
    if (fileStat.size === 0) {
      await unlink(tempPath).catch(() => undefined);
      throw new Error(`Empty file: ${job.label}`);
    }
    if (job.size && fileStat.size !== job.size) {
      await unlink(tempPath).catch(() => undefined);
      throw new Error(`Size mismatch: ${job.label}`);
    }
    const actualSha1 = hash.digest('hex');
    if (job.sha1 && actualSha1 !== job.sha1) {
      await unlink(tempPath).catch(() => undefined);
      throw new Error(`Checksum mismatch: ${job.label}`);
    }

    await rename(tempPath, job.targetPath);
    this.emitProgress({
      id: job.id,
      label: job.label,
      url: job.url,
      targetPath: job.targetPath,
      state: 'complete',
      receivedBytes,
      totalBytes: job.size,
      speedBytesPerSecond: 0
    });
    return job.targetPath;
  }

  private async sha1File(path: string, signal?: AbortSignal): Promise<string> {
    const hash = createHash('sha1');
    const stream = createReadStream(path);
    if (signal) {
      signal.addEventListener('abort', () => stream.destroy(new Error('Aborted')), { once: true });
    }
    stream.on('data', (chunk) => hash.update(chunk));
    await finished(stream);
    this.throwIfAborted(signal);
    return hash.digest('hex');
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error('Operation aborted');
      error.name = 'AbortError';
      throw error;
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
  }

  private linkAbortSignal(parent: AbortSignal | undefined, controller: AbortController): () => void {
    if (!parent) return () => undefined;
    if (parent.aborted) {
      controller.abort(parent.reason);
      return () => undefined;
    }
    const onAbort = () => controller.abort(parent.reason);
    parent.addEventListener('abort', onAbort, { once: true });
    return () => parent.removeEventListener('abort', onAbort);
  }

  private async cleanupPartialDownload(job: DownloadJob): Promise<void> {
    await unlink(`${job.targetPath}.download`).catch(() => undefined);
    await unlink(job.targetPath).catch(() => undefined);
  }

  private fail(job: DownloadJob, error: string): void {
    this.emitProgress({
      id: job.id,
      label: job.label,
      url: job.url,
      targetPath: job.targetPath,
      state: 'failed',
      receivedBytes: 0,
      totalBytes: job.size,
      speedBytesPerSecond: 0,
      error
    });
    void this.logger?.error('download', error, { label: job.label });
  }

  private emitProgress(progress: DownloadProgress): void {
    this.jobs.set(progress.id, progress);
    this.emit('progress', progress);
  }
}
