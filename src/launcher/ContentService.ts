import { dialog } from 'electron';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { ContentFile, ContentKind } from '@/types/launcher';
import { assertContentMatchesKind, sniffContentKind } from './ContentValidation';
import { JsonDatabase } from './JsonDatabase';
import { InstanceService } from './InstanceService';

const extensionsByKind: Record<ContentKind, string[]> = {
  mod: ['.jar', '.disabled'],
  modpack: ['.zip', '.mrpack', '.disabled'],
  resourcepack: ['.zip', '.disabled'],
  shader: ['.zip', '.disabled']
};

export class ContentService {
  constructor(
    private readonly database: JsonDatabase,
    private readonly instances: InstanceService
  ) {}

  private isValidExtension(fileName: string, kind: ContentKind): boolean {
    const ext = extname(fileName).toLowerCase();
    const allowed = extensionsByKind[kind].filter((e) => e !== '.disabled');
    return allowed.includes(ext);
  }

  async list(instanceId: string, kind: ContentKind): Promise<ContentFile[]> {
    const instance = (await this.database.read()).instances.find((item) => item.id === instanceId);
    if (!instance) {
      throw new Error('Instance not found.');
    }

    const dir = this.instances.getContentDir(instance, kind);
    await mkdir(dir, { recursive: true });
    const entries = await readdir(dir, { withFileTypes: true });
    const allowed = extensionsByKind[kind].filter((extension) => extension !== '.disabled');
    const files: ContentFile[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const path = join(dir, entry.name);
      const lower = entry.name.toLowerCase();
      const enabled = !lower.endsWith('.disabled');
      const visibleName = enabled ? entry.name : entry.name.replace(/\.disabled$/i, '');
      const extension = extname(visibleName.toLowerCase());

      if (!allowed.includes(extension)) {
        continue;
      }

      const detected = await sniffContentKind(path).catch(() => null);
      if (detected && detected !== kind) {
        continue;
      }

      const info = await stat(path);
      files.push({
        id: path,
        name: visibleName,
        path,
        enabled,
        size: info.size,
        updatedAt: info.mtimeMs
      });
    }

    return files.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }

  async toggle(instanceId: string, kind: ContentKind, path: string): Promise<ContentFile[]> {
    const target = path.endsWith('.disabled') ? path.replace(/\.disabled$/, '') : `${path}.disabled`;
    await rename(path, target);
    return this.list(instanceId, kind);
  }

  async remove(instanceId: string, kind: ContentKind, path: string): Promise<ContentFile[]> {
    await rm(path, { force: true });
    return this.list(instanceId, kind);
  }

  async import(instanceId: string, kind: ContentKind): Promise<ContentFile[]> {
    const instance = (await this.database.read()).instances.find((item) => item.id === instanceId);
    if (!instance) {
      throw new Error('Instance not found.');
    }

    const result = await dialog.showOpenDialog({
      title: `Import ${kind}`,
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: `${kind} files`,
          extensions: extensionsByKind[kind]
            .map((extension) => extension.replace('.', ''))
            .filter((item) => item !== 'disabled')
        }
      ]
    });

    if (result.canceled) {
      return this.list(instanceId, kind);
    }

    const dir = this.instances.getContentDir(instance, kind);
    await mkdir(dir, { recursive: true });
    const errors: string[] = [];

    for (const file of result.filePaths) {
      const fileName = basename(file);

      try {
        if (!this.isValidExtension(fileName, kind)) {
          throw new Error(`Invalid extension for ${kind}.`);
        }
        await assertContentMatchesKind(file, kind);
        await copyFile(file, join(dir, fileName));
      } catch (error) {
        errors.push(`${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (errors.length === result.filePaths.length) {
      throw new Error(errors.join('\n'));
    }

    if (errors.length) {
      throw new Error(`Some files were skipped:\n${errors.join('\n')}`);
    }

    return this.list(instanceId, kind);
  }
}
