import { Eraser, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { useLauncherStore } from '@/store/useLauncherStore';
import { cn } from '@/utils/cn';

export function ConsolePage() {
  const events = useLauncherStore((state) => state.consoleEvents);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const [localClearAt, setLocalClearAt] = useState(0);
  const visible = events.filter((event) => event.time >= localClearAt);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Console</h2>
          <p className="mt-1 text-sm text-zinc-400">Game logs, launch output, and crash status.</p>
        </div>
        <div className="flex gap-2">
          <Button icon={<Eraser size={16} />} onClick={() => setLocalClearAt(Date.now())}>
            Clear
          </Button>
          <Button tone="danger" icon={<Square size={16} />} onClick={() => selectedInstanceId && window.dawn.minecraft.stop(selectedInstanceId)}>
            Stop
          </Button>
        </div>
      </div>
      <Panel className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-sm">
        {visible.map((event, index) => (
          <div key={`${event.time}:${index}`} className="grid grid-cols-[86px_70px_1fr] gap-3 border-b border-white/[0.04] py-1.5">
            <span className="text-zinc-600">{new Date(event.time).toLocaleTimeString()}</span>
            <span className={cn('uppercase', event.level === 'error' && 'text-red-300', event.level === 'warn' && 'text-yellow-300', event.level === 'info' && 'text-zinc-400')}>{event.level}</span>
            <span className="whitespace-pre-wrap text-zinc-300">{event.message}</span>
          </div>
        ))}
        {!visible.length && <p className="text-zinc-500">No log output yet.</p>}
      </Panel>
    </div>
  );
}
