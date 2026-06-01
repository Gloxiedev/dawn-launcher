import { motion } from 'framer-motion';
import { Cpu, DownloadCloud, HardDrive, Play, Radio, Zap } from 'lucide-react';
import { Button } from '@/components/Button';
import { DownloadWidget } from '@/components/DownloadWidget';
import { MetricCard } from '@/components/MetricCard';
import { Panel } from '@/components/Panel';
import { useLauncherStore } from '@/store/useLauncherStore';

export function HomePage() {
  const instances = useLauncherStore((state) => state.instances);
  const accounts = useLauncherStore((state) => state.accounts);
  const versions = useLauncherStore((state) => state.versions);
  const java = useLauncherStore((state) => state.javaRuntimes);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const selectedAccountId = useLauncherStore((state) => state.selectedAccountId);
  const setSelectedInstance = useLauncherStore((state) => state.setSelectedInstance);
  const setSelectedAccount = useLauncherStore((state) => state.setSelectedAccount);
  const launchSelected = useLauncherStore((state) => state.launchSelected);
  const createInstance = useLauncherStore((state) => state.createInstance);
  const addOfflineAccount = useLauncherStore((state) => state.addOfflineAccount);
  const selectedInstance = instances.find((item) => item.id === selectedInstanceId);
  const selectedAccount = accounts.find((item) => item.id === selectedAccountId);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-h-0 min-w-0 overflow-y-auto pr-1">
        <Panel className="relative min-h-[370px] overflow-hidden p-7">
          <div className="absolute inset-0 opacity-60 [background:radial-gradient(circle_at_70%_30%,rgba(255,122,26,0.28),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_50%)]" />
          <motion.div
            className="absolute right-12 top-14 h-40 w-40 rounded-full border border-orange-300/20"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 26, ease: 'linear' }}
          />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-orange-200">Ready at sunrise</p>
              <h2 className="mt-3 max-w-3xl text-6xl font-black leading-none tracking-normal">Launch Minecraft with Dawn.</h2>
              <p className="mt-4 max-w-xl text-base text-zinc-300">
                {selectedInstance ? `${selectedInstance.name} is set to ${selectedInstance.gameVersion} with ${selectedInstance.loader}.` : 'Create an instance to begin.'}
              </p>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button className="h-16 min-w-48 text-lg" tone="primary" icon={<Play size={24} />} onClick={() => void launchSelected()} disabled={!selectedInstance || !selectedAccount}>
                Play
              </Button>
              <select value={selectedInstanceId ?? ''} onChange={(event) => setSelectedInstance(event.target.value)} className="h-12 rounded-md border border-white/10 bg-zinc-950/90 px-4 text-sm">
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.name}
                  </option>
                ))}
              </select>
              <select value={selectedAccountId ?? ''} onChange={(event) => void setSelectedAccount(event.target.value)} className="h-12 rounded-md border border-white/10 bg-zinc-950/90 px-4 text-sm">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.username}
                  </option>
                ))}
              </select>
              {!instances.length && <Button onClick={() => void createInstance({ name: 'Dawn Survival', gameVersion: versions[0] || 'latest-release' })}>Create Instance</Button>}
              {!accounts.length && <Button onClick={() => void addOfflineAccount('Player')}>Add Offline Account</Button>}
            </div>
          </div>
        </Panel>

        <div className="mt-5 grid grid-cols-4 gap-4">
          <MetricCard label="Version" value={selectedInstance?.gameVersion || 'None'} detail={selectedInstance?.loader || 'No loader'} icon={<Zap size={20} />} />
          <MetricCard label="Java" value={java[0] ? `Java ${java[0].major}` : 'Missing'} detail={java[0]?.version} icon={<Cpu size={20} />} />
          <MetricCard label="RAM" value={`${selectedInstance?.ramMb ?? 0} MB`} detail="Instance allocation" icon={<HardDrive size={20} />} />
          <MetricCard label="Queue" value="Live" detail="Parallel downloads" icon={<DownloadCloud size={20} />} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5">
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Radio size={18} className="text-orange-200" />
              <h3 className="font-black">Release Channel</h3>
            </div>
            <div className="mt-4 grid gap-3">
              {versions.slice(0, 4).map((version) => (
                <button key={version} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08]">
                  <span className="font-semibold">{version}</span>
                  <span className="text-xs text-zinc-500">Manifest</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="p-5">
            <h3 className="font-black">Recently Played</h3>
            <div className="mt-4 grid gap-3">
              {instances.slice(0, 4).map((instance) => (
                <button key={instance.id} onClick={() => setSelectedInstance(instance.id)} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08]">
                  <span className="min-w-0 truncate font-semibold">{instance.name}</span>
                  <span className="text-xs text-zinc-500">{instance.loader}</span>
                </button>
              ))}
              {!instances.length && <p className="text-sm text-zinc-500">No instances yet.</p>}
            </div>
          </Panel>
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-5">
          <DownloadWidget />
          <Panel className="p-5">
            <h3 className="font-black">Profile</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-white/[0.08]">
                {selectedAccount?.avatarUrl ? <img src={selectedAccount.avatarUrl} alt="" /> : <span className="text-2xl font-black">{selectedAccount?.username?.[0] || 'D'}</span>}
              </div>
              <div className="min-w-0">
                <p className="truncate font-black">{selectedAccount?.username || 'No account'}</p>
                <p className="text-sm text-zinc-400">{selectedAccount?.kind || 'Add one'}</p>
              </div>
            </div>
          </Panel>
          <Panel className="p-5">
            <h3 className="font-black">Quick Launch</h3>
            <div className="mt-4 grid gap-3">
              {instances.slice(0, 5).map((instance) => (
                <Button key={instance.id} className="justify-start" icon={<Play size={15} />} onClick={() => {
                  setSelectedInstance(instance.id);
                  void launchSelected();
                }}>
                  {instance.name}
                </Button>
              ))}
            </div>
          </Panel>
        </div>
      </aside>
    </div>
  );
}
