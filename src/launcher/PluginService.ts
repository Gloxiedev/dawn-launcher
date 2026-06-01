import type { PluginManifest } from '@/types/launcher';
import { JsonDatabase } from './JsonDatabase';

export class PluginService {
  constructor(private readonly database: JsonDatabase) {}

  async list(): Promise<PluginManifest[]> {
    return (await this.database.read()).plugins;
  }

  async toggle(id: string): Promise<PluginManifest[]> {
    return this.database.mutate((draft) => {
      draft.plugins = draft.plugins.map((plugin) => (plugin.id === id ? { ...plugin, enabled: !plugin.enabled } : plugin));
      return draft.plugins;
    });
  }
}
