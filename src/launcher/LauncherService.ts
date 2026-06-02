import type { LauncherSettings } from '@/types/launcher';
import { AccountService } from './AccountService';
import { ContentService } from './ContentService';
import { DownloadManager } from './DownloadManager';
import { GalleryService } from './GalleryService';
import { InstanceService } from './InstanceService';
import { JavaService } from './JavaService';
import { JsonDatabase } from './JsonDatabase';
import { PluginService } from './PluginService';

export interface LauncherServiceRegistry {
  database: JsonDatabase;
  accounts: AccountService;
  instances: InstanceService;
  content: ContentService;
  downloads: DownloadManager;
  java: JavaService;
  gallery: GalleryService;
  plugins: PluginService;
}

export class LauncherService {
  constructor(private readonly services: LauncherServiceRegistry) {}

  async bootstrap(): Promise<LauncherSettings> {
    const data = await this.services.database.read();
    await this.services.instances.ensureRoots(data.settings);
    return data.settings;
  }

  get registry(): LauncherServiceRegistry {
    return this.services;
  }
}
