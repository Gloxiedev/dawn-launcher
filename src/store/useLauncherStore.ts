import { create } from 'zustand';
import type { ConsoleEvent, ContentKind, DeviceCodeStart, DownloadProgress, Instance, JavaRuntime, LauncherAccount, LauncherSettings, MarketplaceProject, MarketplaceSearchQuery, NotificationItem, PageId } from '@/types/launcher';

export type { PageId };

interface LauncherState {
  activePage: PageId;
  settings?: LauncherSettings;
  accounts: LauncherAccount[];
  instances: Instance[];
  versions: string[];
  javaRuntimes: JavaRuntime[];
  downloads: DownloadProgress[];
  consoleEvents: ConsoleEvent[];
  notifications: NotificationItem[];
  librarySearch: string;
  librarySearchNonce: number;
  selectedInstanceId?: string;
  selectedAccountId?: string;
  loading: boolean;
  busyLabel?: string;
  error?: string;
  setActivePage(page: PageId): void;
  setLibrarySearch(query: string): void;
  triggerLibrarySearch(): void;
  bootstrap(): Promise<void>;
  refresh(): Promise<void>;
  createInstance(input?: Partial<Instance>): Promise<void>;
  updateInstance(id: string, input: Partial<Instance>): Promise<void>;
  removeInstance(id: string): Promise<void>;
  duplicateInstance(id: string): Promise<void>;
  setSelectedInstance(id: string): void;
  setSelectedAccount(id: string): Promise<void>;
  launchSelected(): Promise<void>;
  scanJava(): Promise<void>;
  saveSettings(input: Partial<LauncherSettings>): Promise<void>;
  addOfflineAccount(username: string): Promise<void>;
  startMicrosoftLogin(): Promise<DeviceCodeStart>;
  completeMicrosoftLogin(): Promise<void>;
  searchMarketplace(query: MarketplaceSearchQuery): Promise<MarketplaceProject[]>;
  installProject(project: MarketplaceProject, instanceId: string): Promise<void>;
  listContent(instanceId: string, kind: ContentKind): Promise<unknown>;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  activePage: 'home',
  accounts: [],
  instances: [],
  versions: [],
  javaRuntimes: [],
  downloads: [],
  consoleEvents: [],
  notifications: [],
  librarySearch: '',
  librarySearchNonce: 0,
  loading: true,
  setActivePage: (page) => set({ activePage: page }),
  setLibrarySearch: (query) => set({ librarySearch: query }),
  triggerLibrarySearch: () => set((state) => ({ librarySearchNonce: state.librarySearchNonce + 1 })),
  setSelectedInstance: (id) => set({ selectedInstanceId: id }),
  bootstrap: async () => {
    const unsubs = [
      window.dawn.events.onDownloadProgress((progress) => {
        set((state) => ({
          downloads: [progress, ...state.downloads.filter((item) => item.id !== progress.id)].slice(0, 80)
        }));
      }),
      window.dawn.events.onConsole((event) => {
        set((state) => ({ consoleEvents: [...state.consoleEvents, event].slice(-400) }));
      }),
      window.dawn.events.onNotification((event) => {
        set((state) => ({ notifications: [event, ...state.notifications].slice(0, 8) }));
      })
    ];
    window.addEventListener('beforeunload', () => unsubs.forEach((unsubscribe) => unsubscribe()), { once: true });
    await get().refresh();
  },
  refresh: async () => {
    set({ loading: true, error: undefined });
    try {
      const [settings, accounts, instances, downloads] = await Promise.all([
        window.dawn.settings.get(),
        window.dawn.accounts.list(),
        window.dawn.instances.list(),
        window.dawn.downloads.list()
      ]);
      set({
        settings,
        accounts,
        instances,
        downloads,
        selectedAccountId: accounts.find((account) => account.selected)?.id ?? accounts[0]?.id,
        selectedInstanceId: get().selectedInstanceId ?? instances[0]?.id,
        loading: false
      });
      void window.dawn.minecraft.listVersions().then((versions) => set({ versions }));
      void get().scanJava();
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  createInstance: async (input = {}) => {
    set({ busyLabel: 'Creating instance' });
    const instance = await window.dawn.instances.create(input);
    set((state) => ({ instances: [instance, ...state.instances], selectedInstanceId: instance.id, busyLabel: undefined }));
  },
  updateInstance: async (id, input) => {
    const updated = await window.dawn.instances.update(id, input);
    set((state) => ({ instances: state.instances.map((item) => (item.id === id ? updated : item)) }));
  },
  removeInstance: async (id) => {
    await window.dawn.instances.remove(id);
    set((state) => {
      const instances = state.instances.filter((item) => item.id !== id);
      return { instances, selectedInstanceId: instances[0]?.id };
    });
  },
  duplicateInstance: async (id) => {
    const instance = await window.dawn.instances.duplicate(id);
    set((state) => ({ instances: [instance, ...state.instances], selectedInstanceId: instance.id }));
  },
  setSelectedAccount: async (id) => {
    const accounts = await window.dawn.accounts.select(id);
    set({ accounts, selectedAccountId: id });
  },
  launchSelected: async () => {
    const { selectedInstanceId, selectedAccountId } = get();
    if (!selectedInstanceId || !selectedAccountId) {
      set({ error: 'Choose an instance and account before launching.' });
      return;
    }
    set({ busyLabel: 'Launching Minecraft', activePage: 'console' });
    try {
      await window.dawn.minecraft.launch({ instanceId: selectedInstanceId, accountId: selectedAccountId });
      await get().refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        error: message,
        consoleEvents: [
          ...state.consoleEvents,
          {
            instanceId: selectedInstanceId,
            level: 'error' as const,
            message,
            time: Date.now()
          }
        ].slice(-400)
      }));
    } finally {
      set({ busyLabel: undefined });
    }
  },
  scanJava: async () => {
    const javaRuntimes = await window.dawn.minecraft.scanJava();
    set({ javaRuntimes });
  },
  saveSettings: async (input) => {
    const settings = await window.dawn.settings.update(input);
    set({ settings });
  },
  addOfflineAccount: async (username) => {
    const account = await window.dawn.accounts.addOffline(username);
    set((state) => ({
      accounts: [...state.accounts.map((item) => ({ ...item, selected: false })), account],
      selectedAccountId: account.id
    }));
  },
  startMicrosoftLogin: async () => {
    set({ busyLabel: 'Starting Microsoft login', error: undefined });
    try {
      return await window.dawn.accounts.microsoftStart();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      throw error;
    } finally {
      set({ busyLabel: undefined });
    }
  },
  completeMicrosoftLogin: async () => {
    set({ busyLabel: 'Completing Microsoft login', error: undefined });
    try {
      const account = await window.dawn.accounts.microsoftComplete();
      set((state) => ({
        accounts: [...state.accounts.map((item) => ({ ...item, selected: false })), account],
        selectedAccountId: account.id
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      throw error;
    } finally {
      set({ busyLabel: undefined });
    }
  },
  searchMarketplace: (query) => window.dawn.marketplace.search(query),
  installProject: async (project, instanceId) => {
    set({ busyLabel: `Installing ${project.title}`, error: undefined });
    try {
      await window.dawn.marketplace.install(project, instanceId);
      await get().refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      throw error;
    } finally {
      set({ busyLabel: undefined });
    }
  },
  listContent: (instanceId, kind) => window.dawn.content.list(instanceId, kind)
}));
