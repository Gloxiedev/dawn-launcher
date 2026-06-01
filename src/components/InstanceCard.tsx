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

  return (
    <Panel className={cn('group overflow-hidden p-4 transition hover:border-orange-300/40', selected && 'accent-ring')}>
      <button className="block w-full text-left" onClick={() => setSelectedInstance(instance.id)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-black">{instance.name}</h3>
              {instance.favorite && <Star size={14} className="fill-orange-300 text-orange-300" />}
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {instance.gameVersion} · {instance.loader}
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-300">{instance.ramMb} MB</span>
        </div>
        <div className="mt-5 h-24 rounded-lg border border-white/10 bg-[linear-gradient(135deg,rgba(255,122,26,0.22),rgba(255,255,255,0.04)),url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Cpath fill=%22%23ffffff%22 fill-opacity=%220.06%22 d=%22M0 0h60v60H0zM60 60h60v60H60z%22/%3E%3C/svg%3E')]" />
      </button>
      <div className="mt-4 flex items-center gap-2">
        <Button className="flex-1" tone={selected ? 'primary' : 'secondary'} icon={<Play size={16} />} onClick={() => void launchSelected()}>
          Play
        </Button>
        <Button title="Open folder" icon={<FolderOpen size={16} />} onClick={() => void window.dawn.instances.openFolder(instance.id)} />
        <Button title="Duplicate" icon={<Copy size={16} />} onClick={() => void duplicateInstance(instance.id)} />
        <Button title="Settings" icon={<Settings2 size={16} />} onClick={() => setSelectedInstance(instance.id)} />
        <Button title="Delete" tone="danger" icon={<Trash2 size={16} />} onClick={() => void removeInstance(instance.id)} />
      </div>
    </Panel>
  );
}
