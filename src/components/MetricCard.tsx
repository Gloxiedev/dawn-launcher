import type { ReactNode } from 'react';
import { Panel } from './Panel';

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
}

export function MetricCard({ label, value, detail, icon }: MetricCardProps) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-normal">{value}</p>
          {detail && <p className="mt-1 text-xs text-zinc-400">{detail}</p>}
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-white/[0.07] text-orange-200">{icon}</div>
      </div>
    </Panel>
  );
}
