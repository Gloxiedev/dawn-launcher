import { pathToFileURL } from 'node:url';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { shell } from 'electron';
import type { ScreenshotItem } from '@/types/launcher';
import { JsonDatabase } from './JsonDatabase';

export class GalleryService {
  constructor(private readonly database: JsonDatabase) {}

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
          .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
          .map(async (entry) => {
            const path = join(dir, entry.name);
            const info = await stat(path);
            const data = await readFile(path);
            return {
              name: entry.name,
              path,
              url: this.previewUrl(path, data),
              size: info.size,
              createdAt: info.birthtimeMs || info.mtimeMs
            };
          })
      );
      return screenshots.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
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

  private previewUrl(path: string, data: Buffer): string {
    const fileUrl = pathToFileURL(path).toString();
    const mime = path.toLowerCase().endsWith('.webp') ? 'image/webp' : path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    return data.length > 6_000_000 ? fileUrl : `data:${mime};base64,${data.toString('base64')}`;
  }
}
