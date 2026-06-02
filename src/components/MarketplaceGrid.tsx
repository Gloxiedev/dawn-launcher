import { Download, Star } from 'lucide-react';
import type { MarketplaceProject } from '@/types/launcher';
import { Button } from './Button';
import { Panel } from './Panel';

interface MarketplaceGridProps {
  projects: MarketplaceProject[];
  instanceId?: string;
  onInstall(project: MarketplaceProject): void;
}

export function MarketplaceGrid({ projects, instanceId, onInstall }: MarketplaceGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {projects.map((project) => (
        <Panel key={`${project.provider}:${project.id}`} className="overflow-hidden p-4">
          <div className="flex gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.07]">
              {project.iconUrl ? <img src={project.iconUrl} alt="" className="h-full w-full object-cover" /> : <Star size={24} className="text-orange-200" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-black">{project.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{project.description}</p>
                </div>
                <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-400">{project.provider}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="truncate text-xs text-zinc-500">{project.downloads?.toLocaleString() ?? 0} downloads · {project.author || 'Community'}</p>
                <Button disabled={!instanceId} tone="primary" icon={<Download size={15} />} onClick={() => onInstall(project)}>
                  Install
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
