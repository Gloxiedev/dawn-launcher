import { motion } from 'framer-motion';
import { BarChart3, Clock, Play, Plus, Star, Timer, Trophy, User, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Button } from '@/components/Button';
import { DownloadWidget } from '@/components/DownloadWidget';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import { useLauncherStore } from '@/store/useLauncherStore';
import { filterInstances } from '@/utils/instanceSearch';

import bg1 from '../../backgrounds/background1.png';
import bg2 from '../../backgrounds/background2.png';

const backgrounds = [bg1, bg2, bg1];

function formatRelativeTime(ts?: number) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number) {
  if (!ms) return '0m';
  const totalMins = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function HomePage() {
  const instances = useLauncherStore((state) => state.instances);
  const accounts = useLauncherStore((state) => state.accounts);
  const versionCatalog = useLauncherStore((state) => state.versionCatalog);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const launchHistory = useLauncherStore((state) => state.launchHistory);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const selectedAccountId = useLauncherStore((state) => state.selectedAccountId);
  const processStates = useLauncherStore((state) => state.processStates);
  const setSelectedInstance = useLauncherStore((state) => state.setSelectedInstance);
  const setSelectedAccount = useLauncherStore((state) => state.setSelectedAccount);
  const launchSelected = useLauncherStore((state) => state.launchSelected);
  const stopGame = useLauncherStore((state) => state.stopGame);
  const createInstance = useLauncherStore((state) => state.createInstance);
  const addOfflineAccount = useLauncherStore((state) => state.addOfflineAccount);

  const selectedInstance = instances.find((item) => item.id === selectedInstanceId);
  const selectedAccount = accounts.find((item) => item.id === selectedAccountId);
  const processState = selectedInstanceId ? processStates[selectedInstanceId] ?? 'idle' : 'idle';
  const isRunning = processState === 'running';
  const isBusy = processState === 'preparing' || processState === 'downloading' || processState === 'launching' || processState === 'stopping';

  const releaseInstances = filterInstances(
    instances.filter((instance) => instance.channel !== 'snapshot'),
    librarySearch
  );
  const releases = versionCatalog.releases.length ? versionCatalog.releases : versionCatalog.all;

  const instanceIndex = instances.findIndex((i) => i.id === selectedInstanceId);
  const heroBg = backgrounds[Math.max(0, instanceIndex) % backgrounds.length];

  const stats = useMemo(() => {
    const totalLaunches = launchHistory.length;
    const totalPlayMs = launchHistory.reduce((sum, h) => sum + (h.durationMs ?? 0), 0);

    const lastSession = launchHistory.length > 0 ? launchHistory[0] : null;

    const instancePlayTime: Record<string, number> = {};
    for (const h of launchHistory) {
      instancePlayTime[h.instanceId] = (instancePlayTime[h.instanceId] ?? 0) + (h.durationMs ?? 0);
    }
    const mostPlayedId = Object.entries(instancePlayTime).sort((a, b) => b[1] - a[1])[0]?.[0];
    const mostPlayedInstance = instances.find((i) => i.id === mostPlayedId);

    const accountPlayTime: Record<string, { username: string; ms: number }> = {};
    for (const h of launchHistory) {
      if (!accountPlayTime[h.accountId]) {
        accountPlayTime[h.accountId] = { username: h.accountUsername, ms: 0 };
      }
      accountPlayTime[h.accountId].ms += h.durationMs ?? 0;
    }
    const mostUsedAccount = Object.values(accountPlayTime).sort((a, b) => b.ms - a.ms)[0];

    return { totalLaunches, totalPlayMs, lastSession, mostPlayedInstance, mostUsedAccount };
  }, [launchHistory, instances]);

  const handlePlayStop = () => {
    if (isRunning && selectedInstanceId) {
      void stopGame(selectedInstanceId);
    } else {
      void launchSelected();
    }
  };

  const recentActivity = launchHistory.slice(0, 4);

  const sidebar = (
    <div className="flex flex-col gap-4">
      <DownloadWidget />

      <Panel className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Active Profile</p>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-muted text-xl font-black">
            {selectedAccount?.avatarUrl ? (
              <img src={selectedAccount.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{selectedAccount?.username?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{selectedAccount?.username || 'No account'}</p>
            <p className="text-xs text-muted capitalize">{selectedAccount ? `${selectedAccount.kind} account` : 'Add one in Accounts'}</p>
          </div>
        </div>
        {accounts.length > 1 && (
          <select
            value={selectedAccountId ?? ''}
            onChange={(event) => void setSelectedAccount(event.target.value)}
            className="ui-input mt-3 h-8 w-full px-2 text-xs"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.username}</option>
            ))}
          </select>
        )}
        {!accounts.length && (
          <Button className="mt-3 w-full h-8 text-xs" onClick={() => void addOfflineAccount('Player')}>
            Add Offline Account
          </Button>
        )}
      </Panel>

      <Panel className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Instances</p>
        <div className="grid gap-1">
          {releaseInstances.slice(0, 6).map((instance) => {
            const active = instance.id === selectedInstanceId;
            return (
              <button
                key={instance.id}
                type="button"
                onClick={() => setSelectedInstance(instance.id)}
                className={`flex min-w-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-white'
                    : 'text-muted hover:bg-surface-hover hover:text-primary'
                }`}
              >
                {instance.favorite ? (
                  <Star size={13} className="shrink-0 fill-orange-300 text-orange-300" />
                ) : (
                  <div className="h-3 w-3 shrink-0 rounded-full border border-subtle" />
                )}
                <span className="min-w-0 truncate font-medium">{instance.name}</span>
                <span className="ml-auto shrink-0 text-xs opacity-60">{instance.gameVersion}</span>
              </button>
            );
          })}
          {!releaseInstances.length && (
            <p className="py-2 text-xs text-muted">No instances yet.</p>
          )}
        </div>
        {releases.length > 0 && (
          <button
            type="button"
            onClick={() => void createInstance({ name: `MC ${releases[0]}`, gameVersion: releases[0], channel: 'release' })}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-subtle px-3 py-2 text-xs text-muted transition hover:border-accent/40 hover:text-primary"
          >
            <Plus size={13} />
            New instance
          </button>
        )}
      </Panel>
    </div>
  );

  return (
    <PageShell aside={sidebar} asideWidth={280}>
      <div className="flex flex-col gap-4">
        <Panel className="relative overflow-hidden" style={{ minHeight: 280 }}>
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-500"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between p-6" style={{ minHeight: 280 }}>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-accent/80">
                  {selectedInstance?.loader === 'vanilla' ? 'Vanilla' : selectedInstance?.loader ?? 'Ready'}
                </span>
                {isRunning && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Running
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-4xl font-black leading-none tracking-tight lg:text-5xl">
                {selectedInstance?.name ?? 'Dawn Launcher'}
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                {selectedInstance
                  ? `Minecraft ${selectedInstance.gameVersion} · ${selectedInstance.ramMb} MB RAM${selectedInstance.lastPlayedAt ? ` · Last played ${formatRelativeTime(selectedInstance.lastPlayedAt)}` : ''}`
                  : 'Select an instance to get started.'}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Button
                tone="primary"
                className="h-11 min-w-[7rem] text-sm font-bold"
                icon={<Play size={18} />}
                onClick={handlePlayStop}
                disabled={((!selectedInstance || !selectedAccount) && !isRunning) || isBusy}
              >
                {isBusy ? 'Loading…' : isRunning ? 'Stop' : 'Play'}
              </Button>

              {instances.length > 0 && (
                <select
                  value={selectedInstanceId ?? ''}
                  onChange={(event) => setSelectedInstance(event.target.value)}
                  className="ui-input h-11 max-w-[11rem] px-3 text-sm"
                >
                  {instances.map((instance) => (
                    <option key={instance.id} value={instance.id}>{instance.name}</option>
                  ))}
                </select>
              )}

              {!instances.length && (
                <Button
                  onClick={() => void createInstance({ name: 'Survival', gameVersion: releases[0] || '1.21.4', channel: 'release' })}
                >
                  Create Instance
                </Button>
              )}
              {!accounts.length && (
                <Button onClick={() => void addOfflineAccount('Player')}>
                  Add Offline Account
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total Launches"
            value={stats.totalLaunches > 0 ? String(stats.totalLaunches) : '0'}
            sub={stats.lastSession ? `Last: ${formatRelativeTime(stats.lastSession.launchedAt) ?? '—'}` : 'No launches yet'}
            icon={<BarChart3 size={16} />}
          />
          <StatCard
            label="Total Play Time"
            value={stats.totalPlayMs > 0 ? formatDuration(stats.totalPlayMs) : '0m'}
            sub={stats.totalLaunches > 0 ? `Across ${stats.totalLaunches} session${stats.totalLaunches !== 1 ? 's' : ''}` : 'Start playing'}
            icon={<Timer size={16} />}
          />
          <StatCard
            label="Most Played"
            value={stats.mostPlayedInstance?.name ?? (instances[0]?.name ?? '—')}
            sub={stats.mostPlayedInstance
              ? formatDuration(stats.mostPlayedInstance.totalPlayTimeMs ?? 0)
              : 'No sessions yet'}
            icon={<Trophy size={16} />}
          />
          <StatCard
            label="Active Account"
            value={selectedAccount?.username ?? '—'}
            sub={selectedAccount ? `${selectedAccount.kind} · ${selectedAccount.uuid.slice(0, 8)}…` : 'No account set'}
            icon={<User size={16} />}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Recent Activity</p>
            <div className="space-y-1.5">
              {recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex min-w-0 items-center gap-3 rounded-md border border-subtle bg-surface-muted px-3 py-2.5"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent">
                    <Zap size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{entry.instanceName}</p>
                    <p className="text-xs text-muted">{entry.gameVersion} · {entry.loader} · {entry.accountUsername}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">{formatRelativeTime(entry.launchedAt)}</p>
                    {entry.durationMs != null && (
                      <p className="text-xs text-muted">{formatDuration(entry.durationMs)}</p>
                    )}
                  </div>
                </div>
              ))}
              {!recentActivity.length && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Clock size={28} className="mb-2 text-muted opacity-40" />
                  <p className="text-sm text-muted">No sessions yet.</p>
                  <p className="mt-0.5 text-xs text-muted opacity-70">Launch a game to see activity here.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Release Versions</p>
            <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1">
              {releases.slice(0, 20).map((version) => (
                <div
                  key={version}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 hover:border-subtle hover:bg-surface-muted"
                >
                  <span className="font-medium text-sm">{version}</span>
                  <button
                    type="button"
                    onClick={() => void createInstance({ name: `MC ${version}`, gameVersion: version, channel: 'release', loader: 'vanilla' })}
                    className="flex shrink-0 items-center gap-1 rounded text-xs text-muted transition hover:text-primary"
                  >
                    <Plus size={13} />
                    Create
                  </button>
                </div>
              ))}
              {!releases.length && (
                <p className="py-4 text-center text-xs text-muted">Loading versions…</p>
              )}
            </div>
          </Panel>
        </div>

        {instances.length > 0 && (
          <Panel className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Instance Library</p>
            <div className="space-y-1.5">
              {releaseInstances.slice(0, 5).map((instance) => (
                <motion.button
                  key={instance.id}
                  type="button"
                  onClick={() => setSelectedInstance(instance.id)}
                  whileHover={{ x: 2 }}
                  transition={{ duration: 0.12 }}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                    instance.id === selectedInstanceId
                      ? 'border-accent/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                      : 'border-subtle bg-surface-muted hover:bg-surface-hover'
                  }`}
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent">
                    <Zap size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{instance.name}</p>
                    <p className="text-xs text-muted">
                      {instance.gameVersion} · {instance.loader}
                      {instance.launchCount != null && instance.launchCount > 0 ? ` · ${instance.launchCount} launch${instance.launchCount !== 1 ? 'es' : ''}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {instance.lastPlayedAt ? (
                      <p className="text-xs text-muted">{formatRelativeTime(instance.lastPlayedAt)}</p>
                    ) : null}
                    {instance.totalPlayTimeMs != null && instance.totalPlayTimeMs > 0 ? (
                      <p className="text-xs text-muted">{formatDuration(instance.totalPlayTimeMs)}</p>
                    ) : null}
                  </div>
                </motion.button>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: ReactNode }) {
  return (
    <Panel className="p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        <div className="grid h-7 w-7 place-items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent">
          {icon}
        </div>
      </div>
      <p className="truncate text-lg font-black leading-tight">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
    </Panel>
  );
}
