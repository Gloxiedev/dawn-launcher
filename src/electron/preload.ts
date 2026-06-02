import { contextBridge, ipcRenderer } from 'electron';
import type {
  ConsoleEvent,
  ContentChangedEvent,
  ContentKind,
  DawnApi,
  DownloadProgress,
  Instance,
  LaunchRequest,
  LauncherAccount,
  LauncherSettings,
  MarketplaceProject,
  MarketplaceSearchQuery,
  NotificationItem,
  ProcessStateEvent
} from '@/types/launcher';

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: DawnApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    platform: process.platform,
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    revealPath: (path: string) => ipcRenderer.invoke('app:revealPath', path)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    unmaximize: () => ipcRenderer.invoke('window:unmaximize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
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
    microsoftPoll: () => ipcRenderer.invoke('accounts:microsoftPoll'),
    microsoftComplete: () => ipcRenderer.invoke('accounts:microsoftComplete'),
    ensureSession: (account: LauncherAccount) => ipcRenderer.invoke('accounts:ensureSession', account)
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
    listVersionCatalog: () => ipcRenderer.invoke('minecraft:listVersionCatalog'),
    scanJava: () => ipcRenderer.invoke('minecraft:scanJava'),
    installLoader: (instanceId: string) => ipcRenderer.invoke('minecraft:installLoader', instanceId),
    launch: (input: LaunchRequest) => ipcRenderer.invoke('minecraft:launch', input),
    stop: (instanceId: string) => ipcRenderer.invoke('minecraft:stop', instanceId),
    getProcessStates: () => ipcRenderer.invoke('minecraft:getProcessStates')
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
    preview: (path: string) => ipcRenderer.invoke('gallery:preview', path),
    watch: (instanceId: string) => ipcRenderer.invoke('gallery:watch', instanceId),
    unwatch: (instanceId: string) => ipcRenderer.invoke('gallery:unwatch', instanceId),
    openFolder: (instanceId: string) => ipcRenderer.invoke('gallery:openFolder', instanceId)
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    clear: () => ipcRenderer.invoke('history:clear')
  },
  events: {
    onDownloadProgress: (listener: (progress: DownloadProgress) => void) => on('download:progress', listener),
    onConsole: (listener: (event: ConsoleEvent) => void) => on('console:event', listener),
    onNotification: (listener: (event: NotificationItem) => void) => on('notification:event', listener),
    onContentChanged: (listener: (event: ContentChangedEvent) => void) => on('content:changed', listener),
    onGalleryChanged: (listener: (instanceId: string) => void) => on('gallery:changed', listener),
    onProcessState: (listener: (event: ProcessStateEvent) => void) => on('process:state', listener),
    onWindowMaximized: (listener: (maximized: boolean) => void) => on('window:maximized', listener)
  }
};

contextBridge.exposeInMainWorld('dawn', api);
