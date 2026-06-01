import { Grid2X2, List, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { InstanceCard } from '@/components/InstanceCard';
import { Panel } from '@/components/Panel';
import type { InstanceLayout, LoaderKind } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

const loaders: LoaderKind[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];

export function InstancesPage() {
  const instances = useLauncherStore((state) => state.instances);
  const versions = useLauncherStore((state) => state.versions);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const createInstance = useLauncherStore((state) => state.createInstance);
  const updateInstance = useLauncherStore((state) => state.updateInstance);
  const [layout, setLayout] = useState<InstanceLayout>('grid');
  const [query, setQuery] = useState('');
  const selected = instances.find((instance) => instance.id === selectedInstanceId);
  const filtered = useMemo(() => instances.filter((instance) => instance.name.toLowerCase().includes(query.toLowerCase())), [instances, query]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-h-0 min-w-0 overflow-y-auto pr-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-normal">Instances</h2>
            <p className="mt-1 text-sm text-zinc-400">Create, tune, duplicate, export, and launch profiles.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="h-10 rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm outline-none" placeholder="Search instances" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button title="Grid" tone={layout === 'grid' ? 'primary' : 'secondary'} icon={<Grid2X2 size={16} />} onClick={() => setLayout('grid')} />
            <Button title="List" tone={layout === 'list' ? 'primary' : 'secondary'} icon={<List size={16} />} onClick={() => setLayout('list')} />
            <Button tone="primary" icon={<Plus size={16} />} onClick={() => void createInstance({ name: `Instance ${instances.length + 1}`, gameVersion: versions[0] || 'latest-release' })}>
              New
            </Button>
          </div>
        </div>
        <div className={layout === 'grid' ? 'grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3' : 'grid gap-3'}>
          {filtered.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} />
          ))}
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto">
        <Panel className="p-5">
          <h3 className="font-black">Instance Settings</h3>
          {selected ? (
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Name</span>
                <input className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none" value={selected.name} onChange={(event) => void updateInstance(selected.id, { name: event.target.value })} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Minecraft</span>
                <select className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none" value={selected.gameVersion} onChange={(event) => void updateInstance(selected.id, { gameVersion: event.target.value, launchVersionId: undefined })}>
                  {[selected.gameVersion, ...versions.slice(0, 80).filter((version) => version !== selected.gameVersion)].map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Loader</span>
                <select className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none" value={selected.loader} onChange={(event) => void updateInstance(selected.id, { loader: event.target.value as LoaderKind, launchVersionId: undefined })}>
                  {loaders.map((loader) => (
                    <option key={loader} value={loader}>
                      {loader}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Loader Version</span>
                <input className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 outline-none" placeholder="Latest" value={selected.loaderVersion ?? ''} onChange={(event) => void updateInstance(selected.id, { loaderVersion: event.target.value || undefined, launchVersionId: undefined })} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">RAM: {selected.ramMb} MB</span>
                <input className="range" type="range" min={1024} max={16384} step={512} value={selected.ramMb} onChange={(event) => void updateInstance(selected.id, { ramMb: Number(event.target.value) })} />
              </label>
              <Button icon={<Save size={16} />} onClick={() => void window.dawn.minecraft.installLoader(selected.id)}>
                Install Loader
              </Button>
              <Button onClick={() => void window.dawn.instances.export(selected.id)}>Export Instance</Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Select or create an instance.</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}
