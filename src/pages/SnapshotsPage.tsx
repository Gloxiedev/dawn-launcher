import { Box, Camera, Play, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import { useLauncherStore } from '@/store/useLauncherStore';
import { filterInstances } from '@/utils/instanceSearch';

export function SnapshotsPage() {
  const instances = useLauncherStore((state) => state.instances);
  const versionCatalog = useLauncherStore((state) => state.versionCatalog);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const createInstance = useLauncherStore((state) => state.createInstance);
  const removeInstance = useLauncherStore((state) => state.removeInstance);
  const setSelectedInstance = useLauncherStore((state) => state.setSelectedInstance);
  const launchSelected = useLauncherStore((state) => state.launchSelected);

  const [newName, setNewName] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [createError, setCreateError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const snapshotInstances = useMemo(
    () => filterInstances(instances.filter((i) => i.channel === 'snapshot'), librarySearch),
    [instances, librarySearch]
  );

  const snapshotVersions = versionCatalog.snapshots;

  const createSnapshotInstance = async (gameVersion: string, nameOverride?: string) => {
    const name = (nameOverride ?? newName).trim();
    if (!name) {
      setCreateError('Enter a name first.');
      nameRef.current?.focus();
      return;
    }
    setCreateError('');
    setBusy(true);
    try {
      await createInstance({ name, gameVersion, channel: 'snapshot', loader: 'vanilla' });
      setNewName('');
      setSelectedVersion('');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleQuickCreate = (version: string) => {
    const autoName = newName.trim() || `Snapshot ${version}`;
    setSelectedVersion(version);
    void createSnapshotInstance(version, autoName);
  };

  const handleLaunch = (instanceId: string) => {
    setSelectedInstance(instanceId);
    void launchSelected();
  };

  return (
    <PageShell>
      <div className="mb-4">
        <h2 className="text-3xl font-black tracking-normal">Snapshots</h2>
        <p className="mt-1 text-sm text-muted">Create and manage snapshot-only instances separately from release builds.</p>
      </div>

      <Panel className="mb-5 p-5">
        <h3 className="mb-1 font-black">Create Snapshot Instance</h3>
        <p className="mb-4 text-xs text-muted">Name your instance, pick a snapshot version, and hit Create — or click any version card below to quick-create.</p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            ref={nameRef}
            className="ui-input h-10 px-3"
            placeholder="Instance name (e.g. Snapshot Testing)"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setCreateError(''); }}
          />
          <select
            className="ui-input h-10 px-3"
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
          >
            <option value="">Choose snapshot version…</option>
            {snapshotVersions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <Button
            tone="primary"
            icon={<Plus size={16} />}
            disabled={!selectedVersion || busy}
            onClick={() => selectedVersion && void createSnapshotInstance(selectedVersion)}
          >
            Create
          </Button>
        </div>
        {createError && <p className="mt-2 text-sm text-red-300">{createError}</p>}
      </Panel>

      {snapshotVersions.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
            Available Snapshots — click to quick-create
            {!newName.trim() && <span className="ml-2 font-normal normal-case">(auto-named, or type a name above first)</span>}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {snapshotVersions.map((version) => (
              <button
                key={version}
                type="button"
                onClick={() => handleQuickCreate(version)}
                className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-muted px-4 py-3 text-left transition hover:border-accent/50 hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">{version}</p>
                  <p className="text-xs text-muted">Snapshot build · Vanilla</p>
                </div>
                <Plus size={15} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      <Panel className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Camera size={18} className="text-accent" />
          <h3 className="font-black">Your Snapshot Instances</h3>
          <span className="ml-auto text-xs text-muted">{snapshotInstances.length} instance{snapshotInstances.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="grid gap-2">
          {snapshotInstances.map((instance) => (
            <div
              key={instance.id}
              className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-muted px-4 py-3"
            >
              <Box size={16} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{instance.name}</p>
                <p className="text-xs text-muted">{instance.gameVersion} · {instance.loader}</p>
              </div>
              <Button
                tone="secondary"
                icon={<Play size={14} />}
                onClick={() => handleLaunch(instance.id)}
              >
                Play
              </Button>
              <Button
                tone="danger"
                icon={<Trash2 size={14} />}
                title="Delete instance"
                onClick={() => void removeInstance(instance.id)}
              />
            </div>
          ))}
          {!snapshotInstances.length && (
            <p className="py-2 text-sm text-muted">No snapshot instances yet. Create one above.</p>
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
