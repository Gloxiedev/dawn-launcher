import AdmZip from 'adm-zip';
import { dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Instance, LauncherSettings } from '@/types/launcher';
import { JsonDatabase } from './JsonDatabase';
import { LauncherPaths } from './LauncherPaths';

export class InstanceService {
  constructor(
    private readonly database: JsonDatabase,
    private readonly paths: LauncherPaths
  ) {}

  async list(): Promise<Instance[]> {
    return (await this.database.read()).instances.sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt));
  }

  async create(input: Partial<Instance>): Promise<Instance> {
    const { settings } = await this.database.read();
    const id = randomUUID();
    const now = Date.now();
    const instance: Instance = {
      id,
      name: input.name?.trim() || 'New Instance',
      gameVersion: input.gameVersion || 'latest-release',
      loader: input.loader || 'vanilla',
      loaderVersion: input.loaderVersion,
      launchVersionId: input.launchVersionId,
      icon: input.icon || 'Sun',
      banner: input.banner,
      createdAt: now,
      updatedAt: now,
      ramMb: input.ramMb || settings.defaultRamMb,
      javaPath: input.javaPath,
      gameDir: input.gameDir || join(this.paths.instancesRoot(settings), id),
      favorite: input.favorite ?? false,
      resolution: input.resolution || { width: 1280, height: 720 }
    };

    await mkdir(instance.gameDir, { recursive: true });
    await Promise.all([
      mkdir(join(instance.gameDir, 'mods'), { recursive: true }),
      mkdir(join(instance.gameDir, 'modpacks'), { recursive: true }),
      mkdir(join(instance.gameDir, 'resourcepacks'), { recursive: true }),
      mkdir(join(instance.gameDir, 'shaderpacks'), { recursive: true }),
      mkdir(join(instance.gameDir, 'screenshots'), { recursive: true }),
      mkdir(join(instance.gameDir, 'backups'), { recursive: true })
    ]);
    await writeFile(join(instance.gameDir, 'dawn-instance.json'), JSON.stringify(instance, null, 2), 'utf8');

    await this.database.mutate((draft) => {
      draft.instances.push(instance);
    });

    return instance;
  }

  async update(id: string, input: Partial<Instance>): Promise<Instance> {
    return this.database.mutate((draft) => {
      const index = draft.instances.findIndex((instance) => instance.id === id);
      if (index === -1) {
        throw new Error('Instance not found.');
      }

      const updated = {
        ...draft.instances[index],
        ...input,
        id,
        updatedAt: Date.now()
      };
      draft.instances[index] = updated;
      return updated;
    });
  }

  async duplicate(id: string): Promise<Instance> {
    const source = (await this.database.read()).instances.find((instance) => instance.id === id);
    if (!source) {
      throw new Error('Instance not found.');
    }

    const { settings } = await this.database.read();
    const nextId = randomUUID();
    const targetDir = join(this.paths.instancesRoot(settings), nextId);
    await cp(source.gameDir, targetDir, { recursive: true, force: true });

    return this.create({
      ...source,
      id: undefined,
      name: `${source.name} Copy`,
      gameDir: targetDir,
      lastPlayedAt: undefined
    });
  }

  async remove(id: string): Promise<void> {
    const instance = (await this.database.read()).instances.find((item) => item.id === id);
    await this.database.mutate((draft) => {
      draft.instances = draft.instances.filter((item) => item.id !== id);
    });

    if (instance) {
      await rm(instance.gameDir, { recursive: true, force: true });
    }
  }

  async export(id: string): Promise<string> {
    const instance = (await this.database.read()).instances.find((item) => item.id === id);
    if (!instance) {
      throw new Error('Instance not found.');
    }

    const save = await dialog.showSaveDialog({
      title: 'Export Dawn instance',
      defaultPath: `${instance.name.replace(/[^\w.-]+/g, '-')}.dawn.zip`,
      filters: [{ name: 'Dawn Instance', extensions: ['zip'] }]
    });

    if (save.canceled || !save.filePath) {
      throw new Error('Export canceled.');
    }

    const zip = new AdmZip();
    zip.addLocalFolder(instance.gameDir, 'instance');
    zip.addFile('dawn-instance.json', Buffer.from(JSON.stringify(instance, null, 2)));
    zip.writeZip(save.filePath);
    return save.filePath;
  }

  async import(zipPath?: string): Promise<Instance> {
    const selected = zipPath || (await this.pickZip());
    const zip = new AdmZip(selected);
    const manifestEntry = zip.getEntry('dawn-instance.json');
    const manifest = manifestEntry ? (JSON.parse(manifestEntry.getData().toString('utf8')) as Partial<Instance>) : {};
    const instance = await this.create({
      name: manifest.name ? `${manifest.name} Imported` : basename(selected).replace(/\.zip$/i, ''),
      gameVersion: manifest.gameVersion,
      loader: manifest.loader,
      loaderVersion: manifest.loaderVersion,
      ramMb: manifest.ramMb,
      icon: manifest.icon
    });

    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith('instance/') && !entry.isDirectory) {
        const relative = entry.entryName.slice('instance/'.length);
        zip.extractEntryTo(entry, instance.gameDir, false, true);
        await stat(join(instance.gameDir, relative)).catch(() => undefined);
      }
    }

    return instance;
  }

  async openFolder(id: string): Promise<void> {
    const instance = (await this.database.read()).instances.find((item) => item.id === id);
    if (!instance) {
      throw new Error('Instance not found.');
    }
    await shell.openPath(instance.gameDir);
  }

  async markPlayed(id: string): Promise<void> {
    await this.update(id, { lastPlayedAt: Date.now() });
  }

  getContentDir(instance: Instance, kind: 'mod' | 'modpack' | 'resourcepack' | 'shader'): string {
    switch (kind) {
      case 'mod':
        return join(instance.gameDir, 'mods');
      case 'resourcepack':
        return join(instance.gameDir, 'resourcepacks');
      case 'shader':
        return join(instance.gameDir, 'shaderpacks');
      case 'modpack':
        return join(instance.gameDir, 'modpacks');
    }
  }

  async ensureRoots(settings: LauncherSettings): Promise<void> {
    await Promise.all([
      mkdir(this.paths.minecraftRoot(settings), { recursive: true }),
      mkdir(this.paths.instancesRoot(settings), { recursive: true }),
      mkdir(this.paths.versionsRoot(settings), { recursive: true }),
      mkdir(this.paths.assetsRoot(settings), { recursive: true }),
      mkdir(this.paths.librariesRoot(settings), { recursive: true }),
      mkdir(this.paths.downloadsRoot(settings), { recursive: true })
    ]);
  }

  private async pickZip(): Promise<string> {
    const result = await dialog.showOpenDialog({
      title: 'Import instance',
      properties: ['openFile'],
      filters: [{ name: 'Instance archive', extensions: ['zip', 'mrpack'] }]
    });

    if (result.canceled || !result.filePaths[0]) {
      throw new Error('Import canceled.');
    }

    return result.filePaths[0];
  }
}
