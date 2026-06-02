import { Grid2X2, List, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { InstanceCard } from '@/components/InstanceCard';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { InstanceLayout, LoaderKind } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';
import { filterInstances } from '@/utils/instanceSearch';

const loaders: LoaderKind[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];

export function InstancesPage() {
  const instances = useLauncherStore((state) => state.instances);
  const versions = useLauncherStore((state) => state.versions);
  const versionCatalog = useLauncherStore((state) => state.versionCatalog);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const createInstance = useLauncherStore((state) => state.createInstance);
  const updateInstance = useLauncherStore((state) => state.updateInstance);
  const [layout, setLayout] = useState<InstanceLayout>('grid');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const selected = instances.find((instance) => instance.id === selectedInstanceId);
  const releaseVersions = versionCatalog.releases.length ? versionCatalog.releases : versions;

  const filtered = useMemo(
    () => filterInstances(instances.filter((instance) => instance.channel !== 'snapshot'), librarySearch),
    [instances, librarySearch]
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError('Instance name is required.');
      return;
    }
    setCreateError('');
    try {
      await createInstance({
        name,
        gameVersion: releaseVersions[0] || 'latest-release',
        channel: 'release'
      });
      setNewName('');
      setShowCreate(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    }
  };

  const settingsAside = (
    <Panel className="p-5">
      <h3 className="font-black">Instance Settings</h3>
      {selected ? (
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Name</span>
            <input
              className="ui-input h-10"
              value={selected.name}
              onChange={(event) => void updateInstance(selected.id, { name: event.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Minecraft</span>
            <select
              className="ui-input h-10"
              value={selected.gameVersion}
              onChange={(event) => void updateInstance(selected.id, { gameVersion: event.target.value, launchVersionId: undefined })}
            >
              {releaseVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Loader</span>
            <select
              className="ui-input h-10"
              value={selected.loader}
              onChange={(event) => void updateInstance(selected.id, { loader: event.target.value as LoaderKind, launchVersionId: undefined })}
            >
              {loaders.map((loader) => (
                <option key={loader} value={loader}>
                  {loader}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Loader Version</span>
            <input
              className="ui-input h-10"
              placeholder="Latest"
              value={selected.loaderVersion ?? ''}
              onChange={(event) => void updateInstance(selected.id, { loaderVersion: event.target.value || undefined, launchVersionId: undefined })}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-muted">RAM: {selected.ramMb} MB</span>
            <input
              className="range"
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={selected.ramMb}
              onChange={(event) => void updateInstance(selected.id, { ramMb: Number(event.target.value) })}
            />
          </label>
          <Button icon={<Save size={16} />} onClick={() => void window.dawn.minecraft.installLoader(selected.id)}>
            Install Loader
          </Button>
          <Button onClick={() => void window.dawn.instances.export(selected.id)}>Export Instance</Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Select or create an instance.</p>
      )}
    </Panel>
  );

  return (
    <PageShell aside={settingsAside} asideWidth={360}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-3xl font-black tracking-normal">Instances</h2>
          <p className="mt-1 text-sm text-muted">Create, tune, duplicate, export, and launch release profiles.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button title="Grid" tone={layout === 'grid' ? 'primary' : 'secondary'} icon={<Grid2X2 size={16} />} onClick={() => setLayout('grid')} />
          <Button title="List" tone={layout === 'list' ? 'primary' : 'secondary'} icon={<List size={16} />} onClick={() => setLayout('list')} />
          <Button tone="primary" icon={<Plus size={16} />} onClick={() => setShowCreate((value) => !value)}>
            New
          </Button>
        </div>
      </div>

      {showCreate && (
        <Panel className="mb-4 p-4">
          <h3 className="font-black">New Instance</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
              <span className="text-muted">Name (required)</span>
              <input className="ui-input h-10" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="My Survival World" />
            </label>
            <Button tone="primary" onClick={() => void handleCreate()}>
              Create
            </Button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-300">{createError}</p>}
        </Panel>
      )}

      <div className={layout === 'grid' ? 'grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3' : 'grid gap-3'}>
        {filtered.map((instance) => (
          <InstanceCard key={instance.id} instance={instance} />
        ))}
        {!filtered.length && <Panel className="p-8 text-center text-sm text-muted">No instances match your search.</Panel>}
      </div>
    </PageShell>
  );
}
