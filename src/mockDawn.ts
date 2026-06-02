import type {
  ConsoleEvent,
  ContentKind,
  DawnApi,
  DeviceCodeStart,
  DownloadProgress,
  Instance,
  JavaRuntime,
  LaunchHistoryEntry,
  LauncherAccount,
  LauncherSettings,
  MarketplaceProject,
  MarketplaceSearchQuery,
  PluginManifest,
  ProcessState,
  ProcessStateEvent,
  ScreenshotItem,
  VersionCatalog
} from './types/launcher';

const defaultSettings: LauncherSettings = {
  accentColor: '#ff7a1a',
  theme: 'ember',
  maxParallelDownloads: 4,
  defaultRamMb: 2048,
  discordRpc: false,
  startMinimized: false,
  performanceMode: false,
  experimentalFeatures: false
};

let settings: LauncherSettings = { ...defaultSettings };

const mockVersionCatalog: VersionCatalog = {
  releases: [
    '1.21.4', '1.21.3', '1.21.1', '1.21',
    '1.20.6', '1.20.4', '1.20.2', '1.20.1',
    '1.19.4', '1.19.2', '1.18.2', '1.17.1',
    '1.16.5', '1.15.2', '1.12.2', '1.8.9'
  ],
  snapshots: [
    '25w02a', '25w01a',
    '24w46a', '24w45a', '24w44a', '24w40a',
    '24w36a', '24w34a', '24w33a', '24w21a',
    '24w18a', '24w14a', '24w10a', '24w04a'
  ],
  all: [
    '1.21.4', '1.21.3', '1.21.1', '1.21',
    '1.20.6', '1.20.4', '1.20.2', '1.20.1',
    '1.19.4', '1.19.2', '1.18.2', '1.17.1',
    '1.16.5', '1.15.2', '1.12.2', '1.8.9',
    '25w02a', '25w01a',
    '24w46a', '24w45a', '24w44a', '24w40a',
    '24w36a', '24w34a', '24w33a', '24w21a',
    '24w18a', '24w14a', '24w10a', '24w04a'
  ]
};

let instances: Instance[] = [
  {
    id: 'demo-1',
    name: 'Survival World',
    gameVersion: '1.21.4',
    loader: 'vanilla',
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 3600000,
    lastPlayedAt: Date.now() - 3600000,
    totalPlayTimeMs: 3 * 3600000 + 25 * 60000,
    launchCount: 8,
    ramMb: 4096,
    gameDir: '/home/user/.dawn/instances/demo-1',
    favorite: true,
    channel: 'release'
  },
  {
    id: 'demo-2',
    name: 'Fabric Modded',
    gameVersion: '1.21.1',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 7200000,
    lastPlayedAt: Date.now() - 86400000,
    totalPlayTimeMs: 1 * 3600000 + 12 * 60000,
    launchCount: 3,
    ramMb: 6144,
    gameDir: '/home/user/.dawn/instances/demo-2',
    favorite: false,
    channel: 'release'
  },
  {
    id: 'demo-3',
    name: 'Snapshot Testing',
    gameVersion: '24w46a',
    loader: 'vanilla',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 1800000,
    totalPlayTimeMs: 0,
    launchCount: 0,
    ramMb: 2048,
    gameDir: '/home/user/.dawn/instances/demo-3',
    favorite: false,
    channel: 'snapshot'
  }
];

let accounts: LauncherAccount[] = [
  {
    id: 'demo-account-1',
    kind: 'offline',
    username: 'Player',
    uuid: '00000000-0000-0000-0000-000000000001',
    selected: true
  }
];

let launchHistory: LaunchHistoryEntry[] = [
  {
    id: 'hist-1',
    instanceId: 'demo-1',
    instanceName: 'Survival World',
    gameVersion: '1.21.4',
    loader: 'vanilla',
    accountId: 'demo-account-1',
    accountUsername: 'Player',
    launchedAt: Date.now() - 3600000,
    exitedAt: Date.now() - 3600000 + 5400000,
    durationMs: 5400000,
    exitCode: 0,
    state: 'exited'
  },
  {
    id: 'hist-2',
    instanceId: 'demo-2',
    instanceName: 'Fabric Modded',
    gameVersion: '1.21.1',
    loader: 'fabric',
    accountId: 'demo-account-1',
    accountUsername: 'Player',
    launchedAt: Date.now() - 86400000,
    exitedAt: Date.now() - 86400000 + 2400000,
    durationMs: 2400000,
    exitCode: 0,
    state: 'exited'
  },
  {
    id: 'hist-3',
    instanceId: 'demo-1',
    instanceName: 'Survival World',
    gameVersion: '1.21.4',
    loader: 'vanilla',
    accountId: 'demo-account-1',
    accountUsername: 'Player',
    launchedAt: Date.now() - 86400000 * 2,
    exitedAt: Date.now() - 86400000 * 2 + 7200000,
    durationMs: 7200000,
    exitCode: 0,
    state: 'exited'
  },
  {
    id: 'hist-4',
    instanceId: 'demo-1',
    instanceName: 'Survival World',
    gameVersion: '1.21.4',
    loader: 'vanilla',
    accountId: 'demo-account-1',
    accountUsername: 'Player',
    launchedAt: Date.now() - 86400000 * 3,
    exitedAt: Date.now() - 86400000 * 3 + 1800000,
    durationMs: 1800000,
    exitCode: 0,
    state: 'exited'
  }
];

const processStates: Record<string, ProcessState> = {};

type ProcessStateListener = (event: ProcessStateEvent) => void;
type ConsoleListener = (event: ConsoleEvent) => void;

const processStateListeners = new Set<ProcessStateListener>();
const consoleListeners = new Set<ConsoleListener>();

function emitProcessState(instanceId: string, state: ProcessState) {
  processStates[instanceId] = state;
  processStateListeners.forEach((fn) => fn({ instanceId, state }));
}

function emitConsole(instanceId: string, level: ConsoleEvent['level'], message: string) {
  consoleListeners.forEach((fn) => fn({ instanceId, level, message, time: Date.now() }));
}

const activeTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

const launchLogScript: [number, ConsoleEvent['level'], string][] = [
  [200,   'info',  'Preparing launch environment…'],
  [500,   'info',  'Resolving Java runtime: OpenJDK 21.0.1'],
  [900,   'info',  'Loading version manifest…'],
  [1300,  'info',  'Verifying assets (0 missing)'],
  [1700,  'info',  'Building JVM arguments'],
  [2100,  'info',  'Starting Minecraft process…'],
  [2600,  'info',  '[Client] Setting user: Player'],
  [3000,  'info',  '[Client] Backend library javaBinaries loaded'],
  [3500,  'debug', '[Render thread] OpenGL debug output enabled'],
  [4000,  'info',  '[Render thread] Environment: authHost=https://authserver.mojang.com'],
  [4500,  'info',  '[Render thread] Setting up game'],
  [5000,  'info',  '[Render thread] Loaded 7 crafting recipes'],
  [5500,  'info',  '[Render thread] Loaded 1159 advancements'],
  [6000,  'info',  '[Render thread] Sound engine started'],
  [7000,  'info',  '[Render thread] Created: 1024x1024 textures/atlas/blocks.png-atlas'],
  [8000,  'info',  '[Render thread] Minecraft is running'],
  [9500,  'info',  '[Render thread] Saving world…'],
  [10500, 'info',  '[Render thread] Stopping!'],
  [11000, 'info',  'Game process exited (code 0)'],
];

function simulateLaunch(instanceId: string, accountId: string) {
  const inst = instances.find((i) => i.id === instanceId);
  const account = accounts.find((a) => a.id === accountId);
  const instName = inst?.name ?? instanceId;
  const timers: ReturnType<typeof setTimeout>[] = [];
  activeTimers.set(instanceId, timers);
  const launchedAt = Date.now();

  emitProcessState(instanceId, 'preparing');
  emitConsole(instanceId, 'info', `Launching "${instName}" (${inst?.gameVersion ?? '?'} / ${inst?.loader ?? 'vanilla'})…`);

  for (const [delay, level, msg] of launchLogScript) {
    timers.push(setTimeout(() => emitConsole(instanceId, level, msg), delay));
  }

  timers.push(setTimeout(() => emitProcessState(instanceId, 'launching'), 800));
  timers.push(setTimeout(() => emitProcessState(instanceId, 'running'), 2400));
  timers.push(setTimeout(() => {
    const exitedAt = Date.now();
    const durationMs = exitedAt - launchedAt;
    emitProcessState(instanceId, 'exited');
    activeTimers.delete(instanceId);

    const entry: LaunchHistoryEntry = {
      id: `hist-mock-${Date.now()}`,
      instanceId,
      instanceName: instName,
      gameVersion: inst?.gameVersion ?? '1.21.4',
      loader: inst?.loader ?? 'vanilla',
      accountId,
      accountUsername: account?.username ?? 'Player',
      launchedAt,
      exitedAt,
      durationMs,
      exitCode: 0,
      state: 'exited'
    };
    launchHistory = [entry, ...launchHistory];

    const instIndex = instances.findIndex((i) => i.id === instanceId);
    if (instIndex !== -1) {
      instances = instances.map((i) => {
        if (i.id !== instanceId) return i;
        return {
          ...i,
          lastPlayedAt: exitedAt,
          launchCount: (i.launchCount ?? 0) + 1,
          totalPlayTimeMs: (i.totalPlayTimeMs ?? 0) + durationMs
        };
      });
    }
  }, 12000));
}

const mockApi: DawnApi = {
  app: {
    getVersion: async () => '0.1.0',
    platform: 'linux',
    openExternal: async (url) => { window.open(url, '_blank'); },
    revealPath: async () => {}
  },
  window: {
    minimize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    toggleMaximize: async () => {},
    close: async () => {},
    isMaximized: async () => false
  },
  settings: {
    get: async () => ({ ...settings }),
    update: async (input) => {
      settings = { ...settings, ...input };
      return { ...settings };
    }
  },
  accounts: {
    list: async () => [...accounts],
    addOffline: async (username) => {
      const account: LauncherAccount = {
        id: `offline-${Date.now()}`,
        kind: 'offline',
        username,
        uuid: `offline-${username}`,
        selected: accounts.length === 0
      };
      accounts = [...accounts.map((a) => ({ ...a, selected: false })), account];
      return account;
    },
    remove: async (id) => {
      accounts = accounts.filter((a) => a.id !== id);
    },
    select: async (id) => {
      accounts = accounts.map((a) => ({ ...a, selected: a.id === id }));
      return [...accounts];
    },
    microsoftStart: async (): Promise<DeviceCodeStart> => ({
      userCode: 'DEMO-CODE',
      verificationUri: 'https://microsoft.com/link',
      message: 'Go to https://microsoft.com/link and enter DEMO-CODE',
      expiresIn: 900,
      interval: 5
    }),
    microsoftPoll: async () => ({ status: 'pending' as const, interval: 5 }),
    microsoftComplete: async () => {
      throw new Error('Microsoft login requires the desktop app.');
    },
    ensureSession: async (account) => account
  },
  instances: {
    list: async () => [...instances],
    create: async (input) => {
      const id = `inst-${Date.now()}`;
      const newInstance: Instance = {
        id,
        name: input.name || 'New Instance',
        gameVersion: input.gameVersion || '1.21.4',
        loader: input.loader || 'vanilla',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ramMb: input.ramMb || settings.defaultRamMb,
        gameDir: `/home/user/.dawn/instances/${id}`,
        channel: input.channel || 'release',
        totalPlayTimeMs: 0,
        launchCount: 0,
        ...input
      };
      instances = [newInstance, ...instances];
      return newInstance;
    },
    update: async (id, input) => {
      const updated = { ...instances.find((i) => i.id === id)!, ...input, updatedAt: Date.now() };
      instances = instances.map((i) => (i.id === id ? updated : i));
      return updated;
    },
    duplicate: async (id) => {
      const source = instances.find((i) => i.id === id)!;
      const duped: Instance = {
        ...source,
        id: `inst-${Date.now()}`,
        name: `${source.name} (Copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalPlayTimeMs: 0,
        launchCount: 0
      };
      instances = [duped, ...instances];
      return duped;
    },
    remove: async (id) => {
      const timers = activeTimers.get(id);
      if (timers) { timers.forEach(clearTimeout); activeTimers.delete(id); }
      instances = instances.filter((i) => i.id !== id);
    },
    export: async (id) => `/tmp/${id}.zip`,
    import: async () => { throw new Error('Import not available in web preview.'); },
    openFolder: async () => {}
  },
  minecraft: {
    listVersions: async () => mockVersionCatalog.all,
    listVersionCatalog: async () => ({ ...mockVersionCatalog }),
    scanJava: async (): Promise<JavaRuntime[]> => [
      { path: '/usr/lib/jvm/java-21', version: '21.0.1', major: 21, vendor: 'OpenJDK', arch: 'x64', valid: true }
    ],
    installLoader: async (instanceId) => instances.find((i) => i.id === instanceId)!,
    launch: async ({ instanceId, accountId }) => {
      simulateLaunch(instanceId, accountId);
      return { pid: Math.floor(Math.random() * 90000) + 10000, instanceId, state: 'preparing' };
    },
    stop: async (instanceId) => {
      const timers = activeTimers.get(instanceId);
      if (timers) { timers.forEach(clearTimeout); activeTimers.delete(instanceId); }
      emitConsole(instanceId, 'info', 'Stopping game…');
      emitProcessState(instanceId, 'stopping');
      setTimeout(() => {
        emitConsole(instanceId, 'info', 'Game process stopped.');
        emitProcessState(instanceId, 'idle');
      }, 800);
    },
    getProcessStates: async () => ({ ...processStates })
  },
  content: {
    list: async () => [],
    toggle: async () => [],
    remove: async () => [],
    import: async () => []
  },
  marketplace: {
    search: async (query: MarketplaceSearchQuery): Promise<MarketplaceProject[]> => {
      const demos: MarketplaceProject[] = [
        { provider: 'modrinth', id: 'm1', slug: 'sodium', title: 'Sodium', description: 'Modern rendering engine and client-side optimization mod for Minecraft.', author: 'CaffeineMC', downloads: 18000000, categories: ['optimization'], projectType: query.kind, clientSide: 'required', serverSide: 'unsupported' },
        { provider: 'modrinth', id: 'm2', slug: 'iris', title: 'Iris Shaders', description: 'A modern shaders mod compatible with OptiFine shader packs.', author: 'IrisShaders', downloads: 12000000, categories: ['shaders'], projectType: query.kind, clientSide: 'required', serverSide: 'unsupported' },
        { provider: 'modrinth', id: 'm3', slug: 'lithium', title: 'Lithium', description: 'No-compromises game logic/server optimization mod.', author: 'CaffeineMC', downloads: 9000000, categories: ['optimization'], projectType: query.kind, clientSide: 'optional', serverSide: 'required' },
        { provider: 'modrinth', id: 'm4', slug: 'fabric-api', title: 'Fabric API', description: 'Lightweight and modular API providing common hooks and intercompatibility measures.', author: 'FabricMC', downloads: 80000000, categories: ['library'], projectType: query.kind, clientSide: 'required', serverSide: 'required' },
        { provider: 'modrinth', id: 'm5', slug: 'jei', title: 'Just Enough Items', description: 'Item and recipe viewing mod for Minecraft, integrating with hundreds of other mods.', author: 'mezz', downloads: 25000000, categories: ['utility'], projectType: query.kind, clientSide: 'required', serverSide: 'optional' }
      ];
      if (!query.query.trim()) return demos;
      return demos.filter((d) => d.title.toLowerCase().includes(query.query.toLowerCase()));
    },
    install: async (project) => {
      throw new Error(`"${project.title}" install requires the desktop app.`);
    }
  },
  downloads: {
    list: async (): Promise<DownloadProgress[]> => []
  },
  plugins: {
    list: async (): Promise<PluginManifest[]> => [],
    toggle: async (): Promise<PluginManifest[]> => []
  },
  gallery: {
    list: async (): Promise<ScreenshotItem[]> => [],
    preview: async () => '',
    watch: async () => {},
    unwatch: async () => {},
    openFolder: async () => {}
  },
  history: {
    list: async (): Promise<LaunchHistoryEntry[]> => [...launchHistory],
    clear: async () => { launchHistory = []; }
  },
  events: {
    onDownloadProgress: () => () => {},
    onConsole: (listener) => {
      consoleListeners.add(listener);
      return () => consoleListeners.delete(listener);
    },
    onNotification: () => () => {},
    onContentChanged: () => () => {},
    onGalleryChanged: () => () => {},
    onProcessState: (listener) => {
      processStateListeners.add(listener);
      return () => processStateListeners.delete(listener);
    },
    onWindowMaximized: () => () => {}
  }
};

export function installMockDawn() {
  if (typeof window !== 'undefined' && !window.dawn) {
    (window as unknown as { dawn: DawnApi }).dawn = mockApi;
  }
}
