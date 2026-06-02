import { ExternalLink, KeyRound, LogIn, Shield, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { DeviceCodeStart } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

// @ts-ignore
import accountsBg from '../../backgrounds/accounts.png';

export function AccountPage() {
  const accounts = useLauncherStore((state) => state.accounts);
  const settings = useLauncherStore((state) => state.settings);
  const setActivePage = useLauncherStore((state) => state.setActivePage);
  const selectedAccountId = useLauncherStore((state) => state.selectedAccountId);
  const setSelectedAccount = useLauncherStore((state) => state.setSelectedAccount);
  const addOfflineAccount = useLauncherStore((state) => state.addOfflineAccount);
  const startMicrosoftLogin = useLauncherStore((state) => state.startMicrosoftLogin);
  const refresh = useLauncherStore((state) => state.refresh);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const visibleAccounts = accounts.filter(
    (account) => !librarySearch.trim() || account.username.toLowerCase().includes(librarySearch.trim().toLowerCase())
  );
  const [offlineName, setOfflineName] = useState('');
  const [deviceStart, setDeviceStart] = useState<DeviceCodeStart>();
  const [authError, setAuthError] = useState('');
  const [polling, setPolling] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasMicrosoftClientId = Boolean(settings?.microsoftClientId?.trim());

  const startLogin = async () => {
    setAuthError('');
    try {
      const start = await startMicrosoftLogin();
      setDeviceStart(start);
      await window.dawn.app.openExternal(start.verificationUri);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (!deviceStart) {
      return;
    }

    let cancelled = false;
    setPolling(true);

    const poll = async () => {
      while (!cancelled) {
        const result = await window.dawn.accounts.microsoftPoll();
        if (result.status === 'complete') {
          setDeviceStart(undefined);
          setPolling(false);
          await refresh();
          return;
        }
        if (result.status === 'expired') {
          setAuthError('Microsoft login expired. Start a new login.');
          setDeviceStart(undefined);
          setPolling(false);
          return;
        }
        if (result.status === 'error') {
          setAuthError(result.message);
          setDeviceStart(undefined);
          setPolling(false);
          return;
        }
        const waitMs = 'interval' in result ? result.interval * 1000 : deviceStart.interval * 1000;
        await new Promise<void>((resolve) => {
          pollTimer.current = setTimeout(resolve, waitMs);
        });
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
      setPolling(false);
    };
  }, [deviceStart, refresh]);

  const authAside = (
    <>
      <Panel className="p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent">
            <LogIn size={16} />
          </div>
          <h3 className="font-black">Microsoft Account</h3>
        </div>
        <div className="grid gap-3">
          <p className="text-xs text-muted leading-relaxed">
            Sign in with your Microsoft account to play the official Minecraft version. Requires a valid Minecraft Java Edition license.
          </p>
          <Button icon={<KeyRound size={16} />} onClick={() => void startLogin()} disabled={polling || !hasMicrosoftClientId}>
            {polling ? 'Waiting for approval…' : 'Start Microsoft Login'}
          </Button>
          {!hasMicrosoftClientId && (
            <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-3">
              <p className="text-sm font-semibold text-yellow-100">
                Microsoft client ID missing.
              </p>
              <p className="mt-1 text-xs text-yellow-100/90">
                Add a Microsoft public client ID in Settings → Credentials to enable Microsoft login.
              </p>
              <Button className="mt-3 w-full" tone="secondary" onClick={() => setActivePage('settings')}>
                Open Settings
              </Button>
            </div>
          )}
          {deviceStart && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Authorization Code</p>
              <p className="mt-1.5 text-3xl font-black tracking-widest text-white">{deviceStart.userCode}</p>
              <p className="mt-2 break-all text-xs text-zinc-400">{deviceStart.verificationUri}</p>
              <p className="mt-3 text-xs text-zinc-500">
                {polling ? '⏳ Waiting for browser approval…' : 'Open the link above and enter the code.'}
              </p>
              <Button className="mt-3 w-full" icon={<ExternalLink size={16} />} onClick={() => void window.dawn.app.openExternal(deviceStart.verificationUri)}>
                Open Browser
              </Button>
            </div>
          )}
          {authError && (
            <p className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-100">{authError}</p>
          )}
        </div>
      </Panel>

      <Panel className="p-5 mt-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent">
            <UserPlus size={16} />
          </div>
          <h3 className="font-black">Offline Account</h3>
        </div>
        <p className="mb-3 text-xs text-muted leading-relaxed">
          Play without a Microsoft account. Offline mode works on servers with online-mode disabled.
        </p>
        <div className="flex gap-2">
          <input
            value={offlineName}
            onChange={(event) => setOfflineName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && offlineName.trim()) {
                void addOfflineAccount(offlineName.trim()).then(() => setOfflineName(''));
              }
            }}
            className="ui-input h-10 min-w-0 flex-1 px-3"
            placeholder="Enter username"
          />
          <Button
            tone="primary"
            disabled={!offlineName.trim()}
            onClick={() => void addOfflineAccount(offlineName.trim()).then(() => setOfflineName(''))}
          >
            Add
          </Button>
        </div>
      </Panel>
    </>
  );

  return (
    <PageShell aside={authAside} asideWidth={380}>
      <Panel className="relative mb-5 overflow-hidden" style={{ minHeight: 130 }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${accountsBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
        <div className="relative z-10 p-5" style={{ minHeight: 130 }}>
          <h2 className="text-3xl font-black tracking-normal">Accounts</h2>
          <p className="mt-1 max-w-lg text-sm text-zinc-300">
            Manage Microsoft and offline profiles for launching Minecraft.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <Shield size={13} />
            <span>{accounts.length} account{accounts.length !== 1 ? 's' : ''} configured</span>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visibleAccounts.map((account) => (
          <Panel key={account.id} className="p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-subtle">
                {account.avatarUrl
                  ? <img src={account.avatarUrl} alt={account.username} className="h-full w-full object-cover" />
                  : <span className="text-3xl font-black text-accent">{account.username[0]?.toUpperCase()}</span>
                }
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-black">{account.username}</h3>
                <p className="text-sm text-muted capitalize">{account.kind} account</p>
                <p className="mt-0.5 truncate text-xs text-muted opacity-60">{account.uuid}</p>
              </div>
              {account.id === selectedAccountId && (
                <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-400/25 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  Active
                </span>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1"
                tone={account.id === selectedAccountId ? 'primary' : 'secondary'}
                onClick={() => void setSelectedAccount(account.id)}
              >
                {account.id === selectedAccountId ? 'Selected' : 'Select'}
              </Button>
              <Button
                tone="danger"
                icon={<Trash2 size={15} />}
                onClick={() => void window.dawn.accounts.remove(account.id).then(refresh)}
              >
                Remove
              </Button>
            </div>
          </Panel>
        ))}
        {!visibleAccounts.length && (
          <Panel className="p-8 text-center text-sm text-muted lg:col-span-2">
            {accounts.length
              ? 'No accounts match your search.'
              : 'No accounts added. Add a Microsoft or offline account to get started.'}
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
