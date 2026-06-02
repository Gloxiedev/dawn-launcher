import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { finished } from 'node:stream/promises';
import { EventEmitter } from 'node:events';
import type { DownloadProgress } from '@/types/launcher';
import { friendlyErrorMessage } from './errors';
import type { Logger } from './Logger';

export interface DownloadJob {
  id: string;
  label: string;
  url: string;
  targetPath: string;
  sha1?: string;
  size?: number;
}

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 750;

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

  async download(job: DownloadJob): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.downloadOnce(job);
      } catch (error) {
        lastError = error;
        await unlink(`${job.targetPath}.download`).catch(() => undefined);
        await unlink(job.targetPath).catch(() => undefined);

        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_BACKOFF_MS * 2 ** attempt;
          await this.logger?.warn('download', `Retrying ${job.label} (attempt ${attempt + 2}/${MAX_RETRIES})`, {
            delay,
            error: error instanceof Error ? error.message : String(error)
          });
          await sleep(delay);
        }
      }
    }

    const message = friendlyErrorMessage(lastError);
    this.fail(job, message);
    throw new Error(message);
  }

  async downloadMany(jobs: DownloadJob[]): Promise<void> {
    const seen = new Set<string>();
    const queue = jobs.filter((job) => {
      const key = job.targetPath.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    for (const job of queue) {
      await this.download(job);
    }
  }

  private async downloadOnce(job: DownloadJob): Promise<string> {
    if (await this.isExistingFileValid(job)) {
      this.emitProgress({
        id: job.id,
        label: job.label,
        url: job.url,
        targetPath: job.targetPath,
        state: 'complete',
        receivedBytes: job.size ?? 0,
        totalBytes: job.size,
        speedBytesPerSecond: 0
      });
      return job.targetPath;
    }

    await mkdir(dirname(job.targetPath), { recursive: true });

    const tempPath = `${job.targetPath}.download`;
    await unlink(tempPath).catch(() => undefined);
    await unlink(job.targetPath).catch(() => undefined);

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
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let response: Response;
    try {
      response = await fetch(job.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)'
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status}) for ${job.label}`);
    }

    const totalBytes = Number(response.headers.get('content-length') || job.size || 0) || undefined;
    const writer = createWriteStream(tempPath, { flags: 'wx' }).on('error', () => undefined);
    const reader = response.body.getReader();
    const hash = createHash('sha1');
    let receivedBytes = 0;
    let lastBytes = 0;
    let lastTime = Date.now();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const buffer = Buffer.from(value);
        hash.update(buffer);
        if (!writer.write(buffer)) {
          await new Promise<void>((resolve) => writer.once('drain', resolve));
        }
        receivedBytes += buffer.byteLength;

        const now = Date.now();
        if (now - lastTime > 300) {
          const speedBytesPerSecond = ((receivedBytes - lastBytes) / (now - lastTime)) * 1000;
          lastBytes = receivedBytes;
          lastTime = now;
          this.emitProgress({
            id: job.id,
            label: job.label,
            url: job.url,
            targetPath: job.targetPath,
            state: 'running',
            receivedBytes,
            totalBytes,
            speedBytesPerSecond
          });
        }
      }
    } catch (error) {
      writer.destroy();
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }

    await finished(writer);

    try {
      await access(tempPath);
    } catch {
      throw new Error(`Temporary download file missing for ${job.label}`);
    }

    const fileStat = await stat(tempPath);
    if (fileStat.size === 0) {
      await unlink(tempPath).catch(() => undefined);
      throw new Error(`Downloaded file is empty for ${job.label}`);
    }

    if (job.size && fileStat.size !== job.size) {
      await unlink(tempPath).catch(() => undefined);
      throw new Error(`Download size mismatch for ${job.label}`);
    }

    const actualSha1 = hash.digest('hex');
    if (job.sha1 && actualSha1 !== job.sha1) {
      await unlink(tempPath).catch(() => undefined);
      throw new Error(`Checksum mismatch for ${job.label}`);
    }

    await rename(tempPath, job.targetPath);

    this.emitProgress({
      id: job.id,
      label: job.label,
      url: job.url,
      targetPath: job.targetPath,
      state: 'complete',
      receivedBytes,
      totalBytes,
      speedBytesPerSecond: 0
    });

    await this.logger?.debug('download', `Completed ${job.label}`, { targetPath: job.targetPath });
    return job.targetPath;
  }

  private async isExistingFileValid(job: DownloadJob): Promise<boolean> {
    try {
      const file = await stat(job.targetPath);
      if (file.size === 0) {
        await unlink(job.targetPath).catch(() => undefined);
        return false;
      }
      if (job.size && file.size !== job.size) {
        await unlink(job.targetPath).catch(() => undefined);
        return false;
      }

      if (!job.sha1) {
        return true;
      }

      const { readFile } = await import('node:fs/promises');
      const hash = createHash('sha1').update(await readFile(job.targetPath)).digest('hex');
      if (hash !== job.sha1) {
        await unlink(job.targetPath).catch(() => undefined);
        return false;
      }
      return true;
    } catch {
      return false;
    }
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
    void this.logger?.error('download', error, { label: job.label, url: job.url });
  }

  private emitProgress(progress: DownloadProgress): void {
    this.jobs.set(progress.id, progress);
    this.emit('progress', progress);
  }
}
