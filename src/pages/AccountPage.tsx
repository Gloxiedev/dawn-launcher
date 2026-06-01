import { ExternalLink, KeyRound, LogIn, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { DeviceCodeStart } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

export function AccountPage() {
  const accounts = useLauncherStore((state) => state.accounts);
  const settings = useLauncherStore((state) => state.settings);
  const selectedAccountId = useLauncherStore((state) => state.selectedAccountId);
  const setSelectedAccount = useLauncherStore((state) => state.setSelectedAccount);
  const addOfflineAccount = useLauncherStore((state) => state.addOfflineAccount);
  const startMicrosoftLogin = useLauncherStore((state) => state.startMicrosoftLogin);
  const refresh = useLauncherStore((state) => state.refresh);
  const [offlineName, setOfflineName] = useState('');
  const [deviceStart, setDeviceStart] = useState<DeviceCodeStart>();
  const [authError, setAuthError] = useState('');
  const [polling, setPolling] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        const waitMs = 'interval' in result ? result.interval : deviceStart.interval * 1000;
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
        <div className="flex items-center gap-2">
          <LogIn size={18} className="text-orange-200" />
          <h3 className="font-black">Microsoft</h3>
        </div>
        <div className="mt-4 grid gap-3">
          <Button icon={<KeyRound size={16} />} onClick={() => void startLogin()} disabled={polling}>
            Start Login
          </Button>
          {!settings?.microsoftClientId && (
            <p className="rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-3 text-xs text-yellow-100">
              Add a Microsoft public client ID in Settings.
            </p>
          )}
          {deviceStart && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">
              <p className="text-xs uppercase text-zinc-500">Code</p>
              <p className="mt-1 text-2xl font-black tracking-widest text-white">{deviceStart.userCode}</p>
              <p className="mt-2 break-all text-xs text-zinc-400">{deviceStart.verificationUri}</p>
              <p className="mt-3 text-xs text-zinc-500">{polling ? 'Waiting for approval in your browser…' : 'Open the link and approve access.'}</p>
              <Button className="mt-3 w-full" icon={<ExternalLink size={16} />} onClick={() => void window.dawn.app.openExternal(deviceStart.verificationUri)}>
                Open Browser
              </Button>
            </div>
          )}
          {authError && <p className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-100">{authError}</p>}
        </div>
      </Panel>
      <Panel className="p-5">
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-orange-200" />
          <h3 className="font-black">Offline</h3>
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={offlineName}
            onChange={(event) => setOfflineName(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none"
            placeholder="Username"
          />
          <Button tone="primary" onClick={() => void addOfflineAccount(offlineName).then(() => setOfflineName(''))}>
            Add
          </Button>
        </div>
      </Panel>
    </>
  );

  return (
    <PageShell aside={authAside} asideWidth={420}>
      <div className="mb-4">
        <h2 className="text-3xl font-black tracking-normal">Accounts</h2>
        <p className="mt-1 text-sm text-zinc-400">Microsoft sessions and offline profiles.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {accounts.map((account) => (
          <Panel key={account.id} className="p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-white/[0.08]">
                {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span className="text-2xl font-black">{account.username[0]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-black">{account.username}</h3>
                <p className="text-sm text-zinc-400">{account.kind}</p>
              </div>
              <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-400">
                {account.id === selectedAccountId ? 'Selected' : 'Ready'}
              </span>
            </div>
            <div className="mt-5 flex gap-2">
              <Button tone={account.id === selectedAccountId ? 'primary' : 'secondary'} onClick={() => void setSelectedAccount(account.id)}>
                Select
              </Button>
              <Button tone="danger" icon={<Trash2 size={15} />} onClick={() => void window.dawn.accounts.remove(account.id).then(refresh)}>
                Remove
              </Button>
            </div>
          </Panel>
        ))}
        {!accounts.length && <Panel className="p-8 text-center text-sm text-zinc-500">No accounts added.</Panel>}
      </div>
    </PageShell>
  );
}
