import { Copy, FolderOpen, Play, Settings2, Star, Trash2 } from 'lucide-react';
import type { Instance } from '@/types/launcher';
import { Button } from './Button';
import { Panel } from './Panel';
import { useLauncherStore } from '@/store/useLauncherStore';
import { cn } from '@/utils/cn';

interface InstanceCardProps {
  instance: Instance;
}

export function InstanceCard({ instance }: InstanceCardProps) {
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const setSelectedInstance = useLauncherStore((state) => state.setSelectedInstance);
  const launchSelected = useLauncherStore((state) => state.launchSelected);
  const duplicateInstance = useLauncherStore((state) => state.duplicateInstance);
  const removeInstance = useLauncherStore((state) => state.removeInstance);

  const selected = selectedInstanceId === instance.id;

  const launchInstance = () => {
    setSelectedInstance(instance.id);
    void launchSelected();
  };

  return (
    <Panel className={cn('group flex min-w-0 flex-col overflow-hidden p-4 transition hover:border-accent/40', selected && 'accent-ring')}>
      <button type="button" className="block min-w-0 text-left" onClick={() => setSelectedInstance(instance.id)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-black">{instance.name}</h3>
              {instance.favorite && <Star size={14} className="shrink-0 fill-orange-300 text-orange-300" />}
            </div>
            <p className="mt-1 truncate text-sm text-muted">
              {instance.gameVersion} · {instance.loader}
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-subtle bg-surface-muted px-2 py-1 text-xs">{instance.ramMb} MB</span>
        </div>
        <div className="mt-4 h-20 rounded-lg border border-subtle bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_22%,transparent),rgba(255,255,255,0.04))]" />
      </button>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
        <Button className="min-w-0 flex-1" tone={selected ? 'primary' : 'secondary'} icon={<Play size={16} />} onClick={launchInstance}>
          Play
        </Button>
        <Button className="shrink-0" title="Open folder" icon={<FolderOpen size={16} />} onClick={() => void window.dawn.instances.openFolder(instance.id)} />
        <Button className="shrink-0" title="Duplicate" icon={<Copy size={16} />} onClick={() => void duplicateInstance(instance.id)} />
        <Button className="shrink-0" title="Settings" icon={<Settings2 size={16} />} onClick={() => setSelectedInstance(instance.id)} />
        <Button className="shrink-0" title="Delete" tone="danger" icon={<Trash2 size={16} />} onClick={() => void removeInstance(instance.id)} />
      </div>
    </Panel>
  );
}
