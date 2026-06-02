import { AlertTriangle, Cpu, HardDrive, Search } from 'lucide-react';
import type { CSSProperties } from 'react';
import { WindowControls } from './WindowControls';
import { useLauncherStore } from '@/store/useLauncherStore';
import type { PageId, ProcessState } from '@/types/launcher';

const libraryPages: PageId[] = ['mods', 'modpacks', 'resourcepacks', 'shaders'];
const searchablePages: PageId[] = ['home', 'instances', 'snapshots', 'accounts', 'console', 'gallery', 'settings', ...libraryPages];

const searchPlaceholders: Partial<Record<PageId, string>> = {
  home: 'Search instances…',
  instances: 'Search instances…',
  snapshots: 'Search snapshots…',
  accounts: 'Search accounts…',
  console: 'Filter console…',
  gallery: 'Search screenshots…',
  settings: 'Search settings…',
  mods: 'Search mods…',
  modpacks: 'Search modpacks…',
  resourcepacks: 'Search resource packs…',
  shaders: 'Search shaders…'
};

const processColors: Partial<Record<ProcessState, string>> = {
  running: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  launching: 'border-orange-300/30 bg-orange-500/10 text-orange-300',
  downloading: 'border-orange-300/30 bg-orange-500/10 text-orange-300',
  preparing: 'border-orange-300/30 bg-orange-500/10 text-orange-300',
  stopping: 'border-yellow-300/30 bg-yellow-500/10 text-yellow-300',
  crashed: 'border-red-400/30 bg-red-500/10 text-red-300'
};

const processLabels: Record<ProcessState, string> = {
  idle: 'Ready',
  preparing: 'Preparing…',
  downloading: 'Downloading…',
  launching: 'Launching…',
  running: 'Running',
  stopping: 'Stopping…',
  stopped: 'Stopped',
  crashed: 'Crashed',
  exited: 'Exited'
};

export function TopBar() {
  const instances = useLauncherStore((state) => state.instances);
  const javaRuntimes = useLauncherStore((state) => state.javaRuntimes);
  const busyLabel = useLauncherStore((state) => state.busyLabel);
  const error = useLauncherStore((state) => state.error);
  const processStates = useLauncherStore((state) => state.processStates);
  const activePage = useLauncherStore((state) => state.activePage);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const setLibrarySearch = useLauncherStore((state) => state.setLibrarySearch);
  const triggerLibrarySearch = useLauncherStore((state) => state.triggerLibrarySearch);
  const selectedInstance = instances.find((item) => item.id === selectedInstanceId);
  const processState = selectedInstanceId ? processStates[selectedInstanceId] ?? 'idle' : 'idle';
  const statusLabel = busyLabel || processLabels[processState];
  const statusColor = processColors[processState] ?? 'border-subtle bg-surface-muted text-muted';
  const showSearch = searchablePages.includes(activePage);

  return (
    <header
      className="titlebar flex shrink-0 items-center gap-3 border-b border-subtle px-5 py-2.5"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="shrink-0 text-base font-black tracking-tight">Dawn Launcher</h1>
            <span className={`hidden shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium sm:inline-flex ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-3 text-xs text-muted">
            <span className="inline-flex shrink-0 items-center gap-1">
              <Cpu size={12} />
              Java {javaRuntimes[0]?.major ?? '—'}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <HardDrive size={12} />
              {selectedInstance?.ramMb ? `${selectedInstance.ramMb} MB` : '—'}
            </span>
            {error && (
              <span className="inline-flex min-w-0 items-center gap-1 text-red-400">
                <AlertTriangle size={12} className="shrink-0" />
                <span className="truncate">{error}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        {showSearch && (
          <label className="relative hidden sm:block">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="ui-input h-8 w-44 pl-8 text-xs lg:w-52"
              placeholder={searchPlaceholders[activePage] ?? 'Search…'}
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && librarySearch.trim()) {
                  triggerLibrarySearch();
                }
              }}
            />
          </label>
        )}
        <WindowControls />
      </div>
    </header>
  );
}
