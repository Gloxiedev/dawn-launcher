import { DownloadCloud } from 'lucide-react';
import { Panel } from './Panel';
import { useLauncherStore } from '@/store/useLauncherStore';

export function DownloadWidget() {
  const downloads = useLauncherStore((state) => state.downloads);
  const running = downloads.filter((item) => item.state === 'running');
  const active = running[0] ?? downloads[0];
  const percent = active?.totalBytes ? Math.round((active.receivedBytes / active.totalBytes) * 100) : active?.state === 'complete' ? 100 : 0;

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-orange-400/15 text-orange-200">
          <DownloadCloud size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold">{active?.label || 'Download Queue'}</p>
            <span className="text-xs text-zinc-400">{percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">{running.length ? `${running.length} running` : active?.state || 'Idle'}</p>
        </div>
      </div>
    </Panel>
  );
}
