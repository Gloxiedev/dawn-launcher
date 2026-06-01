import type { LauncherDatabaseShape, LauncherSettings } from '@/types/launcher';

export const defaultSettings: LauncherSettings = {
  accentColor: '#ff7a1a',
  theme: 'ember',
  maxParallelDownloads: 8,
  defaultRamMb: 4096,
  discordRpc: true,
  startMinimized: false,
  performanceMode: false,
  experimentalFeatures: false
};

export function createDefaultDatabase(): LauncherDatabaseShape {
  return {
    settings: defaultSettings,
    accounts: [],
    instances: [],
    resourceOrder: {},
    shaderPresets: {},
    plugins: [
      {
        id: 'dawn.theme.marketplace',
        name: 'Theme Marketplace Bridge',
        version: '0.1.0',
        enabled: true,
        permissions: ['themes:read', 'themes:install']
      },
      {
        id: 'dawn.content.indexer',
        name: 'Content Indexer',
        version: '0.1.0',
        enabled: true,
        permissions: ['instances:read', 'content:scan']
      }
    ],
    notifications: []
  };
}
