import { app } from 'electron';
import { join } from 'node:path';
import type { LauncherSettings } from '@/types/launcher';

export class LauncherPaths {
  get dataDir(): string {
    return join(app.getPath('userData'), 'dawn-data');
  }

  get databaseFile(): string {
    return join(this.dataDir, 'dawn-data.json');
  }

  minecraftRoot(settings?: LauncherSettings): string {
    return settings?.minecraftRoot || join(this.dataDir, 'minecraft');
  }

  instancesRoot(settings?: LauncherSettings): string {
    return join(this.minecraftRoot(settings), 'instances');
  }

  versionsRoot(settings?: LauncherSettings): string {
    return join(this.minecraftRoot(settings), 'versions');
  }

  assetsRoot(settings?: LauncherSettings): string {
    return join(this.minecraftRoot(settings), 'assets');
  }

  librariesRoot(settings?: LauncherSettings): string {
    return join(this.minecraftRoot(settings), 'libraries');
  }

  runtimeRoot(settings?: LauncherSettings): string {
    return join(this.minecraftRoot(settings), 'runtime');
  }

  downloadsRoot(settings?: LauncherSettings): string {
    return join(this.minecraftRoot(settings), 'downloads');
  }
}
