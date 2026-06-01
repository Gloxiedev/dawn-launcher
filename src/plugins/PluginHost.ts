import type { PluginManifest } from '@/types/launcher';

export interface DawnPluginContext {
  launcherVersion: string;
  emitNotification(title: string, body: string): void;
}

export interface DawnPlugin {
  manifest: PluginManifest;
  activate(context: DawnPluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}

export class PluginHost {
  private active = new Map<string, DawnPlugin>();

  async activate(plugin: DawnPlugin, context: DawnPluginContext): Promise<void> {
    if (this.active.has(plugin.manifest.id) || !plugin.manifest.enabled) {
      return;
    }
    await plugin.activate(context);
    this.active.set(plugin.manifest.id, plugin);
  }

  async deactivate(id: string): Promise<void> {
    const plugin = this.active.get(id);
    if (!plugin) {
      return;
    }
    await plugin.deactivate?.();
    this.active.delete(id);
  }

  listActive(): string[] {
    return [...this.active.keys()];
  }
}
