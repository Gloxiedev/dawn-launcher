import { contextBridge, ipcRenderer } from 'electron';
import type { ConsoleEvent, ContentKind, DawnApi, DownloadProgress, Instance, LaunchRequest, LauncherSettings, MarketplaceProject, MarketplaceSearchQuery, NotificationItem } from '@/types/launcher';

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: DawnApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    revealPath: (path: string) => ipcRenderer.invoke('app:revealPath', path)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (input: Partial<LauncherSettings>) => ipcRenderer.invoke('settings:update', input)
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    addOffline: (username: string) => ipcRenderer.invoke('accounts:addOffline', username),
    remove: (id: string) => ipcRenderer.invoke('accounts:remove', id),
    select: (id: string) => ipcRenderer.invoke('accounts:select', id),
    microsoftStart: () => ipcRenderer.invoke('accounts:microsoftStart'),
    microsoftComplete: () => ipcRenderer.invoke('accounts:microsoftComplete')
  },
  instances: {
    list: () => ipcRenderer.invoke('instances:list'),
    create: (input: Partial<Instance>) => ipcRenderer.invoke('instances:create', input),
    update: (id: string, input: Partial<Instance>) => ipcRenderer.invoke('instances:update', id, input),
    duplicate: (id: string) => ipcRenderer.invoke('instances:duplicate', id),
    remove: (id: string) => ipcRenderer.invoke('instances:remove', id),
    export: (id: string) => ipcRenderer.invoke('instances:export', id),
    import: (zipPath?: string) => ipcRenderer.invoke('instances:import', zipPath),
    openFolder: (id: string) => ipcRenderer.invoke('instances:openFolder', id)
  },
  minecraft: {
    listVersions: () => ipcRenderer.invoke('minecraft:listVersions'),
    scanJava: () => ipcRenderer.invoke('minecraft:scanJava'),
    installLoader: (instanceId: string) => ipcRenderer.invoke('minecraft:installLoader', instanceId),
    launch: (input: LaunchRequest) => ipcRenderer.invoke('minecraft:launch', input),
    stop: (instanceId: string) => ipcRenderer.invoke('minecraft:stop', instanceId)
  },
  content: {
    list: (instanceId: string, kind: ContentKind) => ipcRenderer.invoke('content:list', instanceId, kind),
    toggle: (instanceId: string, kind: ContentKind, path: string) => ipcRenderer.invoke('content:toggle', instanceId, kind, path),
    remove: (instanceId: string, kind: ContentKind, path: string) => ipcRenderer.invoke('content:remove', instanceId, kind, path),
    import: (instanceId: string, kind: ContentKind) => ipcRenderer.invoke('content:import', instanceId, kind)
  },
  marketplace: {
    search: (query: MarketplaceSearchQuery) => ipcRenderer.invoke('marketplace:search', query),
    install: (project: MarketplaceProject, instanceId: string) => ipcRenderer.invoke('marketplace:install', project, instanceId)
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list')
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    toggle: (id: string) => ipcRenderer.invoke('plugins:toggle', id)
  },
  gallery: {
    list: (instanceId: string) => ipcRenderer.invoke('gallery:list', instanceId),
    openFolder: (instanceId: string) => ipcRenderer.invoke('gallery:openFolder', instanceId)
  },
  events: {
    onDownloadProgress: (listener: (progress: DownloadProgress) => void) => on('download:progress', listener),
    onConsole: (listener: (event: ConsoleEvent) => void) => on('console:event', listener),
    onNotification: (listener: (event: NotificationItem) => void) => on('notification:event', listener)
  }
};

contextBridge.exposeInMainWorld('dawn', api);
