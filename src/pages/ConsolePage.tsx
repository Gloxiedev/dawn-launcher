import { Eraser, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { useLauncherStore } from '@/store/useLauncherStore';
import type { ProcessState } from '@/types/launcher';
import { cn } from '@/utils/cn';

const processLabels: Record<ProcessState, string> = {
  idle: 'Idle',
  preparing: 'Preparing',
  downloading: 'Downloading',
  launching: 'Launching',
  running: 'Running',
  stopping: 'Stopping',
  stopped: 'Stopped',
  crashed: 'Crashed',
  exited: 'Exited'
};

const processTone: Record<ProcessState, string> = {
  idle: 'text-zinc-400 border-white/10 bg-white/[0.06]',
  preparing: 'text-orange-200 border-orange-300/30 bg-orange-500/10',
  downloading: 'text-orange-200 border-orange-300/30 bg-orange-500/10',
  launching: 'text-orange-200 border-orange-300/30 bg-orange-500/10',
  running: 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10',
  stopping: 'text-yellow-200 border-yellow-300/30 bg-yellow-500/10',
  stopped: 'text-zinc-300 border-white/10 bg-white/[0.06]',
  crashed: 'text-red-300 border-red-400/30 bg-red-500/10',
  exited: 'text-zinc-300 border-white/10 bg-white/[0.06]'
};

export function ConsolePage() {
  const events = useLauncherStore((state) => state.consoleEvents);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const processStates = useLauncherStore((state) => state.processStates);
  const stopGame = useLauncherStore((state) => state.stopGame);
  const [localClearAt, setLocalClearAt] = useState(0);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const visible = events
    .filter((event) => event.time >= localClearAt)
    .filter((event) => !librarySearch.trim() || event.message.toLowerCase().includes(librarySearch.trim().toLowerCase()));
  const processState = selectedInstanceId ? processStates[selectedInstanceId] ?? 'idle' : 'idle';
  const canStop = ['running', 'launching', 'downloading', 'preparing', 'stopping'].includes(processState);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Console</h2>
          <p className="mt-1 text-sm text-zinc-400">Game logs, launch output, and process status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-md border px-3 py-1.5 text-sm font-medium', processTone[processState])}>
            {processLabels[processState]}
          </span>
          <Button icon={<Eraser size={16} />} onClick={() => setLocalClearAt(Date.now())}>
            Clear
          </Button>
          <Button
            tone="danger"
            icon={<Square size={16} />}
            disabled={!selectedInstanceId || !canStop}
            onClick={() => selectedInstanceId && void stopGame(selectedInstanceId)}
          >
            Stop
          </Button>
        </div>
      </div>
      <Panel className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 font-mono text-sm">
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
