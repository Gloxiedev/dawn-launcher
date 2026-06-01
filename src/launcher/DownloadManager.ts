import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import type { DownloadProgress } from '@/types/launcher';

export interface DownloadJob {
  id: string;
  label: string;
  url: string;
  targetPath: string;
  sha1?: string;
  size?: number;
}

export class DownloadManager extends EventEmitter {
  private readonly jobs = new Map<string, DownloadProgress>();

  list(): DownloadProgress[] {
    return [...this.jobs.values()].map((job) => ({ ...job }));
  }

  async download(job: DownloadJob): Promise<string> {
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

    const response = await fetch(job.url, {
      headers: {
        'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)'
      }
    });

    if (!response.ok || !response.body) {
      const error = `Download failed (${response.status}) ${job.url}`;
      this.fail(job, error);
      throw new Error(error);
    }

    const totalBytes = Number(response.headers.get('content-length') || job.size || 0) || undefined;
    const writer = createWriteStream(tempPath);
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
        writer.write(buffer);
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
    } finally {
      await new Promise<void>((resolve, reject) => {
        writer.end(() => resolve());
        writer.on('error', reject);
      });
    }

    const actualSha1 = hash.digest('hex');
    if (job.sha1 && actualSha1 !== job.sha1) {
      await unlink(tempPath).catch(() => undefined);
      const error = `Checksum mismatch for ${job.label}`;
      this.fail(job, error);
      throw new Error(error);
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

    return job.targetPath;
  }

  async downloadMany(jobs: DownloadJob[], concurrency: number): Promise<void> {
    const queue = [...jobs];
    const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) {
          return;
        }
        await this.download(job);
      }
    });

    await Promise.all(workers);
  }

  private async isExistingFileValid(job: DownloadJob): Promise<boolean> {
    try {
      const file = await stat(job.targetPath);
      if (job.size && file.size !== job.size) {
        return false;
      }

      if (!job.sha1) {
        return file.size > 0;
      }

      const { readFile } = await import('node:fs/promises');
      const hash = createHash('sha1').update(await readFile(job.targetPath)).digest('hex');
      return hash === job.sha1;
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
  }

  private emitProgress(progress: DownloadProgress): void {
    this.jobs.set(progress.id, progress);
    this.emit('progress', progress);
  }
}
