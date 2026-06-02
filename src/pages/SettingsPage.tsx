import { Cpu, FolderOpen, Palette, PlugZap, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { LauncherSettings, PluginManifest } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';
import { cn } from '@/utils/cn';

const themeAccents: Record<LauncherSettings['theme'], string> = {
  ember: '#ff7a1a',
  midnight: '#38bdf8',
  dark: '#a3e635',
  light: '#ff7a1a',
  custom: '#ff7a1a'
};

type SettingsSection = 'appearance' | 'runtime' | 'credentials' | 'java' | 'plugins' | 'history';

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'runtime', label: 'Minecraft Runtime' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'java', label: 'Java Runtimes' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'history', label: 'Launch History' }
];

export function SettingsPage() {
  const settings = useLauncherStore((state) => state.settings);
  const javaRuntimes = useLauncherStore((state) => state.javaRuntimes);
  const launchHistory = useLauncherStore((state) => state.launchHistory);
  const saveSettings = useLauncherStore((state) => state.saveSettings);
  const scanJava = useLauncherStore((state) => state.scanJava);
  const clearHistory = useLauncherStore((state) => state.clearHistory);
  const [draft, setDraft] = useState<Partial<LauncherSettings>>({});
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [section, setSection] = useState<SettingsSection>('appearance');
  const [clearConfirm, setClearConfirm] = useState(false);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const visibleSections = sections.filter(
    (item) => !librarySearch.trim() || item.label.toLowerCase().includes(librarySearch.trim().toLowerCase())
  );

  useEffect(() => {
    setDraft(settings ?? {});
  }, [settings]);

  useEffect(() => {
    void window.dawn.plugins.list().then(setPlugins);
  }, []);

  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const totalPlayMs = launchHistory.reduce((sum, h) => sum + (h.durationMs ?? 0), 0);

  function formatDuration(ms: number) {
    if (!ms) return '0m';
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hrs === 0) return `${remainMins}m`;
    if (remainMins === 0) return `${hrs}h`;
    return `${hrs}h ${remainMins}m`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Settings</h2>
          <p className="mt-1 text-sm text-zinc-400">Runtime, downloads, accounts, and appearance.</p>
        </div>
        <Button tone="primary" icon={<Save size={16} />} onClick={() => void saveSettings(draft)}>
          Save Changes
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg border border-subtle bg-black/20 p-2 lg:max-h-full">
          {visibleSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'rounded-md px-3 py-2.5 text-left text-sm font-semibold text-zinc-400 transition hover:bg-white/[0.08] hover:text-white',
                section === item.id && 'bg-white/[0.1] text-white accent-ring'
              )}
            >
              {item.label}
            </button>
          ))}
          <div className="mt-auto hidden pt-2 lg:block">
            <Button
              className="w-full"
              icon={<FolderOpen size={16} />}
              onClick={() => draft.minecraftRoot && void window.dawn.app.revealPath(draft.minecraftRoot)}
              disabled={!draft.minecraftRoot}
            >
              Reveal Root
            </Button>
          </div>
        </nav>

        <PageShell>
          {section === 'appearance' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Palette size={18} className="text-accent" />
                <h3 className="font-black">Theme & Appearance</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Accent Color</span>
                  <input
                    type="color"
                    value={draft.accentColor ?? '#ff7a1a'}
                    onChange={(event) => update('accentColor', event.target.value)}
                    className="h-10 w-full rounded-md border border-subtle bg-black/30 p-1 cursor-pointer"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Theme</span>
                  <select
                    value={draft.theme ?? 'ember'}
                    onChange={(event) => {
                      const theme = event.target.value as LauncherSettings['theme'];
                      setDraft((current) => ({
                        ...current,
                        theme,
                        accentColor: themeAccents[theme]
                      }));
                    }}
                    className="ui-input h-10 px-3"
                  >
                    <option value="ember">Ember</option>
                    <option value="midnight">Midnight</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2 md:col-span-2 sm:grid-cols-5">
                  {(['ember', 'midnight', 'dark', 'light', 'custom'] as const).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, theme, accentColor: themeAccents[theme] }))}
                      className={cn(
                        'h-10 rounded-md border text-sm font-semibold capitalize transition',
                        draft.theme === theme
                          ? 'border-accent/50 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-white'
                          : 'border-subtle bg-surface-muted text-muted hover:bg-surface-hover hover:text-primary'
                      )}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
                {draft.theme === 'custom' && (
                  <label className="grid gap-2 text-sm md:col-span-2">
                    <span className="text-zinc-400">Custom CSS Variables</span>
                    <textarea
                      value={draft.customThemeCss ?? ''}
                      onChange={(event) => update('customThemeCss', event.target.value)}
                      className="ui-input min-h-28 p-3 font-mono text-xs"
                      placeholder=":root { --page-bg: #0a0a0a; }"
                    />
                  </label>
                )}
              </div>
            </Panel>
          )}

          {section === 'runtime' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Cpu size={18} className="text-accent" />
                <h3 className="font-black">Minecraft Runtime</h3>
              </div>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Default RAM: <strong className="text-primary">{(draft.defaultRamMb ?? 4096).toLocaleString()} MB</strong></span>
                  <input
                    className="range"
                    type="range"
                    min={1024}
                    max={24576}
                    step={512}
                    value={draft.defaultRamMb ?? 4096}
                    onChange={(event) => update('defaultRamMb', Number(event.target.value))}
                  />
                  <div className="flex justify-between text-xs text-muted">
                    <span>1 GB</span>
                    <span>24 GB</span>
                  </div>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Java Executable Path</span>
                  <input
                    value={draft.javaPath ?? ''}
                    onChange={(event) => update('javaPath', event.target.value || undefined)}
                    className="ui-input h-10 px-3"
                    placeholder="Auto-detect (recommended)"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Minecraft Root Directory</span>
                  <input
                    value={draft.minecraftRoot ?? ''}
                    onChange={(event) => update('minecraftRoot', event.target.value || undefined)}
                    className="ui-input h-10 px-3"
                    placeholder="Default app data directory"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-sm transition hover:bg-surface-hover">
                  <span>Performance Mode</span>
                  <input
                    type="checkbox"
                    checked={draft.performanceMode ?? false}
                    onChange={(event) => update('performanceMode', event.target.checked)}
                    className="accent-[var(--accent)] h-4 w-4"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-sm transition hover:bg-surface-hover">
                  <span>Discord Rich Presence</span>
                  <input
                    type="checkbox"
                    checked={draft.discordRpc ?? true}
                    onChange={(event) => update('discordRpc', event.target.checked)}
                    className="accent-[var(--accent)] h-4 w-4"
                  />
                </label>
              </div>
            </Panel>
          )}

          {section === 'credentials' && (
            <Panel className="p-5">
              <h3 className="mb-4 font-black">Credentials & API Keys</h3>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Microsoft Azure Public Client ID</span>
                  <input
                    value={draft.microsoftClientId ?? ''}
                    onChange={(event) => update('microsoftClientId', event.target.value || undefined)}
                    className="ui-input h-10 px-3 font-mono text-sm"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <p className="text-xs text-muted">Required for Microsoft account login. Create a public client app in Azure Portal.</p>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">CurseForge API Key</span>
                  <input
                    value={draft.curseForgeApiKey ?? ''}
                    onChange={(event) => update('curseForgeApiKey', event.target.value || undefined)}
                    className="ui-input h-10 px-3"
                    placeholder="$2a$10$…"
                  />
                  <p className="text-xs text-muted">Required to search and install mods from CurseForge.</p>
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-sm transition hover:bg-surface-hover">
                  <div>
                    <p>Experimental Features</p>
                    <p className="text-xs text-muted mt-0.5">Enable debug logging and unstable features.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.experimentalFeatures ?? false}
                    onChange={(event) => update('experimentalFeatures', event.target.checked)}
                    className="accent-[var(--accent)] h-4 w-4"
                  />
                </label>
              </div>
            </Panel>
          )}

          {section === 'java' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu size={18} className="text-accent" />
                  <h3 className="font-black">Java Runtimes</h3>
                </div>
                <Button icon={<RefreshCcw size={15} />} onClick={() => void scanJava()}>
                  Scan Again
                </Button>
              </div>
              <div className="grid gap-3">
                {javaRuntimes.map((runtime) => (
                  <button
                    key={runtime.path}
                    type="button"
                    onClick={() => update('javaPath', runtime.path)}
                    className={cn(
                      'w-full min-w-0 overflow-hidden rounded-lg border p-3.5 text-left transition',
                      draft.javaPath === runtime.path
                        ? 'border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                        : 'border-subtle bg-surface-muted hover:bg-surface-hover'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">Java {runtime.major}</p>
                      <div className="flex items-center gap-2">
                        {runtime.vendor && <span className="text-xs text-muted">{runtime.vendor}</span>}
                        {runtime.arch && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-muted">{runtime.arch}</span>}
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', runtime.valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300')}>
                          {runtime.valid ? 'Valid' : 'Invalid'}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">{runtime.path}</p>
                    <p className="mt-0.5 text-xs text-muted opacity-60">{runtime.version}</p>
                  </button>
                ))}
                {!javaRuntimes.length && (
                  <div className="rounded-lg border border-subtle bg-surface-muted p-5 text-center text-sm text-muted">
                    <p>No Java runtimes detected.</p>
                    <p className="mt-1 text-xs">Install Java 17 or later and click Scan Again.</p>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {section === 'plugins' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <PlugZap size={18} className="text-accent" />
                <h3 className="font-black">Plugins</h3>
              </div>
              <div className="grid gap-3">
                {plugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => void window.dawn.plugins.toggle(plugin.id).then(setPlugins)}
                    className="flex items-center justify-between rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-left transition hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <span className="block min-w-0 truncate text-sm font-semibold">{plugin.name}</span>
                      <span className="text-xs text-muted">v{plugin.version}</span>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                      plugin.enabled
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-surface-muted text-muted'
                    )}>
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>
                ))}
                {!plugins.length && (
                  <p className="text-sm text-muted">No plugins installed.</p>
                )}
              </div>
            </Panel>
          )}

          {section === 'history' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-black">Launch History</h3>
                {launchHistory.length > 0 && (
                  <Button
                    tone="danger"
                    icon={<Trash2 size={15} />}
                    onClick={() => {
                      if (clearConfirm) {
                        void clearHistory();
                        setClearConfirm(false);
                      } else {
                        setClearConfirm(true);
                        setTimeout(() => setClearConfirm(false), 3000);
                      }
                    }}
                  >
                    {clearConfirm ? 'Confirm Clear' : 'Clear History'}
                  </Button>
                )}
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-subtle bg-surface-muted p-3 text-center">
                  <p className="text-2xl font-black">{launchHistory.length}</p>
                  <p className="mt-0.5 text-xs text-muted">Total Sessions</p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface-muted p-3 text-center">
                  <p className="text-2xl font-black">{formatDuration(totalPlayMs)}</p>
                  <p className="mt-0.5 text-xs text-muted">Total Play Time</p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface-muted p-3 text-center sm:col-span-1 col-span-2">
                  <p className="text-2xl font-black">
                    {launchHistory.filter(h => h.state === 'crashed').length}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">Crashes</p>
                </div>
              </div>
              {launchHistory.length > 0 ? (
                <div className="max-h-96 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                  {launchHistory.slice(0, 50).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex min-w-0 items-center gap-3 rounded-md border border-subtle bg-surface-muted px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{entry.instanceName}</p>
                        <p className="text-xs text-muted">
                          {entry.gameVersion} · {entry.loader} · {entry.accountUsername}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted">{new Date(entry.launchedAt).toLocaleDateString()}</p>
                        {entry.durationMs != null && (
                          <p className="text-xs text-muted">{formatDuration(entry.durationMs)}</p>
                        )}
                        <span className={cn(
                          'inline-block rounded px-1.5 py-0.5 text-xs',
                          entry.state === 'exited' ? 'text-emerald-300' :
                          entry.state === 'crashed' ? 'text-red-300' :
                          'text-zinc-400'
                        )}>
                          {entry.state}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted py-6">No launch history yet. Play some Minecraft!</p>
              )}
            </Panel>
          )}
        </PageShell>
      </div>
    </div>
  );
}
