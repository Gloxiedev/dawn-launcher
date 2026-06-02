import { DownloadCloud } from 'lucide-react';
import { Panel } from './Panel';
import { useLauncherStore } from '@/store/useLauncherStore';

export function DownloadWidget() {
  const downloads = useLauncherStore((state) => state.downloads);
  const active = downloads.find((item) => item.state === 'running') ?? downloads[0];
  const percent = active?.totalBytes ? Math.round((active.receivedBytes / active.totalBytes) * 100) : active?.state === 'complete' ? 100 : 0;

  return (
    <Panel className="p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent">
          <DownloadCloud size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{active?.label || 'Downloads'}</p>
            <span className="shrink-0 text-xs text-muted">{percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 truncate text-xs text-muted">{active?.state === 'running' ? 'Downloading…' : active?.state || 'Idle'}</p>
        </div>
      </div>
    </Panel>
  );
}
