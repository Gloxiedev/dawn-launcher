import { Activity, AlertTriangle, Cpu, HardDrive, Play, Search } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { useLauncherStore } from '@/store/useLauncherStore';
import type { PageId } from '@/types/launcher';

const libraryPages: PageId[] = ['mods', 'modpacks', 'resourcepacks', 'shaders'];

export function TopBar() {
  const instances = useLauncherStore((state) => state.instances);
  const accounts = useLauncherStore((state) => state.accounts);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const selectedAccountId = useLauncherStore((state) => state.selectedAccountId);
  const javaRuntimes = useLauncherStore((state) => state.javaRuntimes);
  const busyLabel = useLauncherStore((state) => state.busyLabel);
  const error = useLauncherStore((state) => state.error);
  const activePage = useLauncherStore((state) => state.activePage);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const launchSelected = useLauncherStore((state) => state.launchSelected);
  const setActivePage = useLauncherStore((state) => state.setActivePage);
  const setLibrarySearch = useLauncherStore((state) => state.setLibrarySearch);
  const triggerLibrarySearch = useLauncherStore((state) => state.triggerLibrarySearch);
  const setSelectedInstance = useLauncherStore((state) => state.setSelectedInstance);
  const setSelectedAccount = useLauncherStore((state) => state.setSelectedAccount);
  const selectedInstance = instances.find((item) => item.id === selectedInstanceId);

  const submitLibrarySearch = () => {
    if (activePage === 'instances' || libraryPages.includes(activePage)) {
      triggerLibrarySearch();
      return;
    }
    if (!libraryPages.includes(activePage)) {
      setActivePage('mods');
    }
    triggerLibrarySearch();
  };

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-4 px-6 py-3" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-xl font-black tracking-normal">Dawn Launcher</h1>
          <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-400">Premium Java</span>
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Cpu size={14} /> Java {javaRuntimes[0]?.major || 'missing'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HardDrive size={14} /> {selectedInstance?.ramMb ?? 0} MB
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity size={14} /> {busyLabel || 'Ready'}
          </span>
          {error && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-red-300">
              <AlertTriangle size={14} /> <span className="truncate">{error}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <label className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="h-10 w-64 rounded-md border border-white/10 bg-white/[0.06] pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60"
            placeholder="Search library"
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submitLibrarySearch();
              }
            }}
          />
        </label>
        <select
          value={selectedInstanceId ?? ''}
          onChange={(event) => setSelectedInstance(event.target.value)}
          className="h-10 max-w-48 rounded-md border border-white/10 bg-zinc-950/80 px-3 text-sm outline-none"
        >
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {instance.name}
            </option>
          ))}
        </select>
        <select
          value={selectedAccountId ?? ''}
          onChange={(event) => void setSelectedAccount(event.target.value)}
          className="h-10 max-w-44 rounded-md border border-white/10 bg-zinc-950/80 px-3 text-sm outline-none"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.username}
            </option>
          ))}
        </select>
        <Button tone="primary" icon={<Play size={17} />} onClick={() => void launchSelected()}>
          Play
        </Button>
      </div>
    </header>
  );
}
