import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeImage, shell } from 'electron';
import type { ScreenshotItem } from '@/types/launcher';
import { JsonDatabase } from './JsonDatabase';

const IMAGE_PATTERN = /\.(png|jpe?g|webp)$/i;

export class GalleryService {
  private watchers = new Map<string, FSWatcher>();
  private onChange?: (instanceId: string) => void;

  constructor(private readonly database: JsonDatabase) {}

  setChangeHandler(handler: (instanceId: string) => void): void {
    this.onChange = handler;
  }

  watchInstance(instanceId: string): void {
    void this.database.read().then((data) => {
      const instance = data.instances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      const dir = join(instance.gameDir, 'screenshots');
      void mkdir(dir, { recursive: true });

      const existing = this.watchers.get(instanceId);
      if (existing) {
        existing.close();
      }

      const watcher = watch(dir, { persistent: false }, () => {
        this.onChange?.(instanceId);
      });
      watcher.on('error', () => undefined);
      this.watchers.set(instanceId, watcher);
    });
  }

  unwatchInstance(instanceId: string): void {
    const watcher = this.watchers.get(instanceId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(instanceId);
    }
  }

  async list(instanceId: string): Promise<ScreenshotItem[]> {
    const instance = (await this.database.read()).instances.find((item) => item.id === instanceId);
    if (!instance) {
      throw new Error('Instance not found.');
    }

    const dir = join(instance.gameDir, 'screenshots');
    await mkdir(dir, { recursive: true });

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const screenshots = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && IMAGE_PATTERN.test(entry.name))
          .map(async (entry) => {
            const path = join(dir, entry.name);
            let info;
            try {
              info = await stat(path);
            } catch {
              return null;
            }

            return {
              name: entry.name,
              path,
              size: info.size,
              createdAt: info.birthtimeMs || info.mtimeMs
            } satisfies ScreenshotItem;
          })
      );

      return screenshots.filter((item): item is ScreenshotItem => item !== null).sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async preview(path: string): Promise<string> {
    try {
      const info = await stat(path);
      if (!info.isFile()) {
        return '';
      }

      const image = nativeImage.createFromPath(path);
      if (image.isEmpty()) {
        return '';
      }

      const { width, height } = image.getSize();
      const maxEdge = 960;
      const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
      const resized =
        scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(width * scale)),
              height: Math.max(1, Math.round(height * scale)),
              quality: 'good'
            })
          : image;
      return resized.toDataURL();
    } catch {
      return '';
    }
  }

  async openFolder(instanceId: string): Promise<void> {
    const instance = (await this.database.read()).instances.find((item) => item.id === instanceId);
    if (!instance) {
      throw new Error('Instance not found.');
    }

    const dir = join(instance.gameDir, 'screenshots');
    await mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  }
}
