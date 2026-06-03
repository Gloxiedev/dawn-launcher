export type PageId =
  | 'home'
  | 'instances'
  | 'snapshots'
  | 'mods'
  | 'modpacks'
  | 'resourcepacks'
  | 'shaders'
  | 'accounts'
  | 'settings'
  | 'console'
  | 'gallery';

export type InstanceChannel = 'release' | 'snapshot';

export interface VersionCatalog {
  releases: string[];
  snapshots: string[];
  all: string[];
}

export type LoaderKind = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';

export type ContentKind = 'mod' | 'modpack' | 'resourcepack' | 'shader';

export type InstanceLayout = 'grid' | 'list';

export type AccountKind = 'microsoft' | 'offline';

export type DownloadState = 'queued' | 'running' | 'complete' | 'failed' | 'paused';

export type ProcessState =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'launching'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'crashed'
  | 'exited';

export interface LauncherSettings {
  accentColor: string;
  theme: 'dark' | 'light' | 'midnight' | 'ember' | 'custom';
  customThemeCss?: string;
  maxParallelDownloads: number;
  defaultRamMb: number;
  javaPath?: string;
  minecraftRoot?: string;
  microsoftClientId?: string;
  curseForgeApiKey?: string;
  discordRpc: boolean;
  startMinimized: boolean;
  performanceMode: boolean;
  /** When true, download all game assets before spawning Minecraft (slower). */
  downloadAssetsBeforeLaunch?: boolean;
  experimentalFeatures: boolean;
  windowWidth?: number;
  windowHeight?: number;
}

export interface JavaRuntime {
  path: string;
  version: string;
  major: number;
  vendor?: string;
  arch?: string;
  valid: boolean;
}

export interface LauncherAccount {
  id: string;
  kind: AccountKind;
  username: string;
  uuid: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  selected?: boolean;
}

export interface Instance {
  id: string;
  name: string;
  gameVersion: string;
  loader: LoaderKind;
  loaderVersion?: string;
  launchVersionId?: string;
  icon?: string;
  banner?: string;
  lastPlayedAt?: number;
  totalPlayTimeMs?: number;
  launchCount?: number;
  createdAt: number;
  updatedAt: number;
  ramMb: number;
  javaPath?: string;
  gameDir: string;
  favorite?: boolean;
  channel?: InstanceChannel;
  resolution?: {
    width: number;
    height: number;
  };
}

export interface LaunchHistoryEntry {
  id: string;
  instanceId: string;
  instanceName: string;
  gameVersion: string;
  loader: LoaderKind;
  accountId: string;
  accountUsername: string;
  launchedAt: number;
  exitedAt?: number;
  durationMs?: number;
  exitCode?: number | null;
  state: 'running' | 'exited' | 'crashed' | 'stopped';
}

export interface ContentFile {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  size: number;
  updatedAt: number;
}

export interface DownloadProgress {
  id: string;
  label: string;
  url: string;
  targetPath: string;
  state: DownloadState;
  receivedBytes: number;
  totalBytes?: number;
  speedBytesPerSecond: number;
  error?: string;
}

export interface MarketplaceProject {
  provider: 'modrinth' | 'curseforge';
  id: string;
  slug?: string;
  title: string;
  description: string;
  author?: string;
  iconUrl?: string;
  downloads?: number;
  follows?: number;
  categories: string[];
  projectType: ContentKind;
  clientSide?: 'required' | 'optional' | 'unsupported' | 'unknown';
  serverSide?: 'required' | 'optional' | 'unsupported' | 'unknown';
  latestVersion?: string;
}

export interface MarketplaceSearchQuery {
  provider: 'modrinth' | 'curseforge';
  query: string;
  kind: ContentKind;
  gameVersion?: string;
  loader?: LoaderKind;
  limit?: number;
}

export interface LaunchRequest {
  instanceId: string;
  accountId: string;
}

export interface LaunchResult {
  pid: number;
  instanceId: string;
  state: ProcessState;
}

export interface DeviceCodeStart {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
  interval: number;
}

export interface ConsoleEvent {
  instanceId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  time: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  createdAt: number;
}

export interface ScreenshotItem {
  name: string;
  path: string;
  size: number;
  createdAt: number;
}

export interface ContentChangedEvent {
  instanceId: string;
  kind: ContentKind;
}

export interface LauncherDatabaseShape {
  settings: LauncherSettings;
  accounts: LauncherAccount[];
  instances: Instance[];
  resourceOrder: Record<string, string[]>;
  shaderPresets: Record<string, Record<string, unknown>>;
  plugins: PluginManifest[];
  notifications: NotificationItem[];
  launchHistory: LaunchHistoryEntry[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  entry?: string;
  permissions: string[];
}

export interface ProcessStateEvent {
  instanceId: string;
  state: ProcessState;
}

export interface DawnApi {
  app: {
    getVersion(): Promise<string>;
    platform: NodeJS.Platform;
    openExternal(url: string): Promise<void>;
    revealPath(path: string): Promise<void>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    unmaximize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
  };
  settings: {
    get(): Promise<LauncherSettings>;
    update(input: Partial<LauncherSettings>): Promise<LauncherSettings>;
  };
  accounts: {
    list(): Promise<LauncherAccount[]>;
    addOffline(username: string): Promise<LauncherAccount>;
    remove(id: string): Promise<void>;
    select(id: string): Promise<LauncherAccount[]>;
    microsoftStart(): Promise<DeviceCodeStart>;
    microsoftPoll(): Promise<
      | { status: 'pending'; interval: number }
      | { status: 'slow_down'; interval: number }
      | { status: 'complete'; account: LauncherAccount }
      | { status: 'expired' }
      | { status: 'error'; message: string }
    >;
    microsoftComplete(): Promise<LauncherAccount>;
    ensureSession(account: LauncherAccount): Promise<LauncherAccount>;
  };
  instances: {
    list(): Promise<Instance[]>;
    create(input: Partial<Instance>): Promise<Instance>;
    update(id: string, input: Partial<Instance>): Promise<Instance>;
    duplicate(id: string): Promise<Instance>;
    remove(id: string): Promise<void>;
    export(id: string): Promise<string>;
    import(zipPath?: string): Promise<Instance>;
    openFolder(id: string): Promise<void>;
  };
  minecraft: {
    listVersions(): Promise<string[]>;
    listVersionCatalog(): Promise<VersionCatalog>;
    scanJava(): Promise<JavaRuntime[]>;
    installLoader(instanceId: string): Promise<Instance>;
    launch(input: LaunchRequest): Promise<LaunchResult>;
    stop(instanceId: string): Promise<void>;
    getProcessStates(): Promise<Record<string, ProcessState>>;
  };
  content: {
    list(instanceId: string, kind: ContentKind): Promise<ContentFile[]>;
    toggle(instanceId: string, kind: ContentKind, path: string): Promise<ContentFile[]>;
    remove(instanceId: string, kind: ContentKind, path: string): Promise<ContentFile[]>;
    import(instanceId: string, kind: ContentKind): Promise<ContentFile[]>;
  };
  marketplace: {
    search(query: MarketplaceSearchQuery): Promise<MarketplaceProject[]>;
    install(project: MarketplaceProject, instanceId: string): Promise<void>;
  };
  downloads: {
    list(): Promise<DownloadProgress[]>;
  };
  plugins: {
    list(): Promise<PluginManifest[]>;
    toggle(id: string): Promise<PluginManifest[]>;
  };
  gallery: {
    list(instanceId: string): Promise<ScreenshotItem[]>;
    preview(path: string): Promise<string>;
    watch(instanceId: string): Promise<void>;
    unwatch(instanceId: string): Promise<void>;
    openFolder(instanceId: string): Promise<void>;
  };
  history: {
    list(): Promise<LaunchHistoryEntry[]>;
    clear(): Promise<void>;
  };
  events: {
    onDownloadProgress(listener: (progress: DownloadProgress) => void): () => void;
    onConsole(listener: (event: ConsoleEvent) => void): () => void;
    onNotification(listener: (event: NotificationItem) => void): () => void;
    onContentChanged(listener: (event: ContentChangedEvent) => void): () => void;
    onGalleryChanged(listener: (instanceId: string) => void): () => void;
    onProcessState(listener: (event: ProcessStateEvent) => void): () => void;
    onWindowMaximized(listener: (maximized: boolean) => void): () => void;
  };
}
