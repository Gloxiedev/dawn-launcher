import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LauncherDatabaseShape } from '@/types/launcher';
import { createDefaultDatabase } from './defaults';

export class JsonDatabase {
  private data?: LauncherDatabaseShape;

  constructor(private readonly filePath: string) {}

  async read(): Promise<LauncherDatabaseShape> {
    if (this.data) {
      return structuredClone(this.data);
    }

    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.data = this.mergeDefaults(JSON.parse(raw) as Partial<LauncherDatabaseShape>);
    } catch {
      this.data = createDefaultDatabase();
      await this.write(this.data);
    }

    return structuredClone(this.data);
  }

  async write(next: LauncherDatabaseShape): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
    this.data = structuredClone(next);
  }

  async mutate<T>(mutator: (draft: LauncherDatabaseShape) => T | Promise<T>): Promise<T> {
    const draft = await this.read();
    const result = await mutator(draft);
    await this.write(draft);
    return result;
  }

  private mergeDefaults(input: Partial<LauncherDatabaseShape>): LauncherDatabaseShape {
    const defaults = createDefaultDatabase();

    return {
      settings: { ...defaults.settings, ...input.settings },
      accounts: input.accounts ?? defaults.accounts,
      instances: input.instances ?? defaults.instances,
      resourceOrder: input.resourceOrder ?? defaults.resourceOrder,
      shaderPresets: input.shaderPresets ?? defaults.shaderPresets,
      plugins: input.plugins ?? defaults.plugins,
      notifications: input.notifications ?? defaults.notifications
    };
  }
}
