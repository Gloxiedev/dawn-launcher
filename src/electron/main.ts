import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import type { DownloadProgress, LauncherAccount, LauncherSettings, MarketplaceProject, MarketplaceSearchQuery, NotificationItem, ProcessState } from '@/types/launcher';
import { MarketplaceService } from '@/api/MarketplaceService';
import { AccountService } from '@/launcher/AccountService';
import { ContentService } from '@/launcher/ContentService';
import { DownloadManager } from '@/launcher/DownloadManager';
import { InstanceService } from '@/launcher/InstanceService';
import { JavaService } from '@/launcher/JavaService';
import { JsonDatabase } from '@/launcher/JsonDatabase';
import { LauncherPaths } from '@/launcher/LauncherPaths';
import { Logger } from '@/launcher/Logger';
import { GalleryService } from '@/launcher/GalleryService';
import { PluginService } from '@/launcher/PluginService';
import { LoaderService } from '@/minecraft/LoaderService';
import { MinecraftService } from '@/minecraft/MinecraftService';
import { VersionService } from '@/minecraft/VersionService';

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow: BrowserWindow | undefined;

const paths = new LauncherPaths();
const logger = new Logger(join(app.getPath('userData'), 'logs'));
const database = new JsonDatabase(paths.databaseFile);
const downloads = new DownloadManager(logger);
const javaService = new JavaService(paths, logger);
const versionService = new VersionService(paths, downloads);
const accountService = new AccountService(database);
const instanceService = new InstanceService(database, paths);
const contentService = new ContentService(database, instanceService);
const pluginService = new PluginService(database);
const galleryService = new GalleryService(database);
const loaderService = new LoaderService(versionService, downloads, javaService, paths, instanceService);

function sendProcessState(instanceId: string, state: ProcessState): void {
  mainWindow?.webContents.send('process:state', { instanceId, state });
}

const minecraftService = new MinecraftService(
  database,
  versionService,
  loaderService,
  javaService,
  instanceService,
  accountService,
  (event) => {
    mainWindow?.webContents.send('console:event', event);
  },
  sendProcessState,
  logger
);
const marketplaceService = new MarketplaceService(database, downloads, paths, instanceService, loaderService);

function sendDownload(progress: DownloadProgress): void {
  mainWindow?.webContents.send('download:progress', progress);
}

function sendNotification(item: NotificationItem): void {
  mainWindow?.webContents.send('notification:event', item);
}

downloads.on('progress', sendDownload);

async function saveWindowBounds(): Promise<void> {
  if (!mainWindow || mainWindow.isMaximized() || mainWindow.isMinimized()) {
    return;
  }

  const [width, height] = mainWindow.getSize();
  await database.mutate((draft) => {
    draft.settings.windowWidth = width;
    draft.settings.windowHeight = height;
  });
}

async function createWindow(settings?: LauncherSettings): Promise<void> {
  const useCustomChrome = process.platform !== 'darwin';
  const width = Math.max(1040, settings?.windowWidth ?? 1280);
  const height = Math.max(680, settings?.windowHeight ?? 800);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: !useCustomChrome,
    backgroundColor: '#080808',
    title: 'Dawn Launcher',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false));
  mainWindow.on('resize', () => {
    void saveWindowBounds();
  });
  mainWindow.on('close', () => {
    void saveWindowBounds();
  });

  mainWindow.on('unresponsive', () => {
    const win = mainWindow;
    if (!win) return;
    void dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Dawn Launcher',
      message: 'The launcher is busy (downloading or processing game files) and is temporarily not responding.',
      detail: 'This is normal during asset downloads or large library scans. Please wait a moment.',
      buttons: ['Wait'],
      defaultId: 0,
      cancelId: 0
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('app:openExternal', async (_event, url: string) => shell.openExternal(url));
  ipcMain.handle('app:revealPath', async (_event, path: string) => shell.showItemInFolder(path));

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.maximize());
  ipcMain.handle('window:unmaximize', () => mainWindow?.unmaximize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle('settings:get', async () => (await database.read()).settings);
  ipcMain.handle('settings:update', async (_event, input: Partial<LauncherSettings>) => {
    const settings = await database.mutate((draft) => {
      draft.settings = { ...draft.settings, ...input };
      return draft.settings;
    });
    logger.setDebugMode(Boolean(settings.experimentalFeatures));
    await instanceService.ensureRoots(settings);
    return settings;
  });

  ipcMain.handle('accounts:list', () => accountService.list());
  ipcMain.handle('accounts:addOffline', (_event, username: string) => accountService.addOffline(username));
  ipcMain.handle('accounts:remove', (_event, id: string) => accountService.remove(id));
  ipcMain.handle('accounts:select', (_event, id: string) => accountService.select(id));
  ipcMain.handle('accounts:microsoftStart', () => accountService.microsoftStart());
  ipcMain.handle('accounts:microsoftPoll', () => accountService.microsoftPoll());
  ipcMain.handle('accounts:microsoftComplete', () => accountService.microsoftComplete());
  ipcMain.handle('accounts:ensureSession', (_event, account: LauncherAccount) => accountService.ensureValidSession(account));

  ipcMain.handle('instances:list', () => instanceService.list());
  ipcMain.handle('instances:create', (_event, input) => instanceService.create(input));
  ipcMain.handle('instances:update', (_event, id: string, input) => instanceService.update(id, input));
  ipcMain.handle('instances:duplicate', (_event, id: string) => instanceService.duplicate(id));
  ipcMain.handle('instances:remove', (_event, id: string) => instanceService.remove(id));
  ipcMain.handle('instances:export', (_event, id: string) => instanceService.export(id));
  ipcMain.handle('instances:import', (_event, zipPath?: string) => instanceService.import(zipPath));
  ipcMain.handle('instances:openFolder', (_event, id: string) => instanceService.openFolder(id));

  ipcMain.handle('minecraft:listVersions', () => minecraftService.listVersions());
  ipcMain.handle('minecraft:listVersionCatalog', () => minecraftService.listVersionCatalog());
  ipcMain.handle('minecraft:scanJava', () => minecraftService.scanJava());
  ipcMain.handle('minecraft:installLoader', (_event, instanceId: string) => minecraftService.installLoader(instanceId));
  ipcMain.handle('minecraft:launch', async (_event, input) => {
    const timeoutPromise = new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Launch request timed out after 15 minutes'));
      }, 900000);
    });

    try {
      const result = await Promise.race([
        minecraftService.launch(input),
        timeoutPromise
      ]) as any;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[IPC] minecraft:launch error:', message);
      logger.error('launch', `IPC minecraft:launch failed: ${message}`, { stack: error instanceof Error ? error.stack : '' });
      throw error;
    }
  });
  ipcMain.handle('minecraft:stop', (_event, instanceId: string) => minecraftService.stop(instanceId));
  ipcMain.handle('minecraft:getProcessStates', () => minecraftService.getProcessStates());

  ipcMain.handle('history:list', () => minecraftService.listHistory());
  ipcMain.handle('history:clear', () => minecraftService.clearHistory());

  ipcMain.handle('content:list', (_event, instanceId: string, kind) => contentService.list(instanceId, kind));
  ipcMain.handle('content:toggle', (_event, instanceId: string, kind, path: string) => contentService.toggle(instanceId, kind, path));
  ipcMain.handle('content:remove', (_event, instanceId: string, kind, path: string) => contentService.remove(instanceId, kind, path));
  ipcMain.handle('content:import', (_event, instanceId: string, kind) => contentService.import(instanceId, kind));

  ipcMain.handle('marketplace:search', (_event, query: MarketplaceSearchQuery) => marketplaceService.search(query));
  ipcMain.handle('marketplace:install', async (_event, project: MarketplaceProject, instanceId: string) => {
    await marketplaceService.install(project, instanceId);
    mainWindow?.webContents.send('content:changed', { instanceId, kind: project.projectType });
    sendNotification({
      id: `${project.provider}:${project.id}:${Date.now()}`,
      title: 'Install complete',
      body: `${project.title} was added to the selected instance.`,
      tone: 'success',
      createdAt: Date.now()
    });
  });

  ipcMain.handle('downloads:list', () => downloads.list());
  ipcMain.handle('plugins:list', () => pluginService.list());
  ipcMain.handle('plugins:toggle', (_event, id: string) => pluginService.toggle(id));
  ipcMain.handle('gallery:list', (_event, instanceId: string) => galleryService.list(instanceId));
  ipcMain.handle('gallery:preview', (_event, path: string) => galleryService.preview(path));
  ipcMain.handle('gallery:watch', (_event, instanceId: string) => galleryService.watchInstance(instanceId));
  ipcMain.handle('gallery:unwatch', (_event, instanceId: string) => galleryService.unwatchInstance(instanceId));
  ipcMain.handle('gallery:openFolder', (_event, instanceId: string) => galleryService.openFolder(instanceId));

  galleryService.setChangeHandler((instanceId) => {
    mainWindow?.webContents.send('gallery:changed', instanceId);
  });
}

app.whenReady().then(async () => {
  await logger.init();
  registerIpc();
  const data = await database.read();
  logger.setDebugMode(Boolean(data.settings.experimentalFeatures));
  await instanceService.ensureRoots(data.settings);
  await createWindow(data.settings);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void database.read().then((data) => createWindow(data.settings));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
