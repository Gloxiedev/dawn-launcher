import { Cpu, FolderOpen, Palette, PlugZap, RefreshCcw, Save } from 'lucide-react';
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

type SettingsSection = 'appearance' | 'runtime' | 'credentials' | 'java' | 'plugins';

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'runtime', label: 'Minecraft Runtime' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'java', label: 'Java Runtimes' },
  { id: 'plugins', label: 'Plugins' }
];

export function SettingsPage() {
  const settings = useLauncherStore((state) => state.settings);
  const javaRuntimes = useLauncherStore((state) => state.javaRuntimes);
  const saveSettings = useLauncherStore((state) => state.saveSettings);
  const scanJava = useLauncherStore((state) => state.scanJava);
  const [draft, setDraft] = useState<Partial<LauncherSettings>>({});
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [section, setSection] = useState<SettingsSection>('appearance');

  useEffect(() => {
    setDraft(settings ?? {});
  }, [settings]);

  useEffect(() => {
    void window.dawn.plugins.list().then(setPlugins);
  }, []);

  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Settings</h2>
          <p className="mt-1 text-sm text-zinc-400">Runtime, downloads, accounts, and appearance.</p>
        </div>
        <Button tone="primary" icon={<Save size={16} />} onClick={() => void saveSettings(draft)}>
          Save
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-black/20 p-2 lg:max-h-full">
          {sections.map((item) => (
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
              onClick={() => draft.minecraftRoot && window.dawn.app.revealPath(draft.minecraftRoot)}
            >
              Reveal Root
            </Button>
          </div>
        </nav>

        <PageShell>
          {section === 'appearance' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Palette size={18} className="text-orange-200" />
                <h3 className="font-black">Theme</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Accent</span>
                  <input
                    type="color"
                    value={draft.accentColor ?? '#ff7a1a'}
                    onChange={(event) => update('accentColor', event.target.value)}
                    className="h-10 w-full rounded-md border border-white/10 bg-zinc-950/80 p-1"
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
                    className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
                  >
                    <option value="ember">Ember</option>
                    <option value="midnight">Midnight</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2 md:col-span-2 sm:grid-cols-4">
                  {(['ember', 'midnight', 'dark', 'light', 'custom'] as const).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, theme, accentColor: themeAccents[theme] }))}
                      className="h-10 rounded-md border border-white/10 bg-white/[0.05] text-sm font-semibold capitalize transition hover:bg-white/[0.09]"
                    >
                      {theme}
                    </button>
                  ))}
                </div>
                {draft.theme === 'custom' && (
                  <label className="grid gap-2 text-sm md:col-span-2">
                    <span className="text-zinc-400">Custom CSS</span>
                    <textarea
                      value={draft.customThemeCss ?? ''}
                      onChange={(event) => update('customThemeCss', event.target.value)}
                      className="min-h-28 rounded-md border border-white/10 bg-zinc-950/80 p-3 font-mono text-xs outline-none"
                    />
                  </label>
                )}
              </div>
            </Panel>
          )}

          {section === 'runtime' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Cpu size={18} className="text-orange-200" />
                <h3 className="font-black">Minecraft Runtime</h3>
              </div>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Default RAM: {draft.defaultRamMb ?? 4096} MB</span>
                  <input
                    className="range"
                    type="range"
                    min={1024}
                    max={24576}
                    step={512}
                    value={draft.defaultRamMb ?? 4096}
                    onChange={(event) => update('defaultRamMb', Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Java executable</span>
                  <input
                    value={draft.javaPath ?? ''}
                    onChange={(event) => update('javaPath', event.target.value)}
                    className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
                    placeholder="Auto detect"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Minecraft root</span>
                  <input
                    value={draft.minecraftRoot ?? ''}
                    onChange={(event) => update('minecraftRoot', event.target.value)}
                    className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
                    placeholder="App data default"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Parallel downloads</span>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={draft.maxParallelDownloads ?? 8}
                    onChange={(event) => update('maxParallelDownloads', Number(event.target.value))}
                    className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm lg:hidden">
                  Discord RPC
                  <input type="checkbox" checked={draft.discordRpc ?? true} onChange={(event) => update('discordRpc', event.target.checked)} />
                </label>
              </div>
            </Panel>
          )}

          {section === 'credentials' && (
            <Panel className="p-5">
              <h3 className="font-black">Credentials</h3>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">Microsoft public client ID</span>
                  <input
                    value={draft.microsoftClientId ?? ''}
                    onChange={(event) => update('microsoftClientId', event.target.value)}
                    className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
                    placeholder="Azure application (public client)"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-zinc-400">CurseForge API key</span>
                  <input
                    value={draft.curseForgeApiKey ?? ''}
                    onChange={(event) => update('curseForgeApiKey', event.target.value)}
                    className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
                    placeholder="CurseForge API key"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                  Discord RPC
                  <input type="checkbox" checked={draft.discordRpc ?? true} onChange={(event) => update('discordRpc', event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                  Performance mode
                  <input type="checkbox" checked={draft.performanceMode ?? false} onChange={(event) => update('performanceMode', event.target.checked)} />
                </label>
              </div>
            </Panel>
          )}

          {section === 'java' && (
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-black">Detected Java</h3>
                <Button icon={<RefreshCcw size={15} />} onClick={() => void scanJava()}>
                  Scan
                </Button>
              </div>
              <div className="mt-4 grid gap-3">
                {javaRuntimes.map((runtime) => (
                  <button
                    key={runtime.path}
                    type="button"
                    onClick={() => update('javaPath', runtime.path)}
                    className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.08]"
                  >
                    <p className="font-semibold">Java {runtime.major}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">{runtime.path}</p>
                  </button>
                ))}
                {!javaRuntimes.length && <p className="text-sm text-zinc-500">No Java runtimes found. Install Java 17+ and scan again.</p>}
              </div>
            </Panel>
          )}

          {section === 'plugins' && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <PlugZap size={18} className="text-orange-200" />
                <h3 className="font-black">Plugins</h3>
              </div>
              <div className="grid gap-3">
                {plugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => window.dawn.plugins.toggle(plugin.id).then(setPlugins)}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold">{plugin.name}</span>
                    <span className="text-xs text-zinc-500">{plugin.enabled ? 'On' : 'Off'}</span>
                  </button>
                ))}
                {!plugins.length && <p className="text-sm text-zinc-500">No plugins installed.</p>}
              </div>
            </Panel>
          )}
        </PageShell>
      </div>
    </div>
  );
}
