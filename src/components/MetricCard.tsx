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
    <Panel className="min-w-0 overflow-hidden p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs uppercase text-muted">{label}</p>
          <p className="mt-1 truncate text-2xl font-black tracking-normal">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted">{detail}</p>}
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent">
          {icon}
        </div>
      </div>
    </Panel>
  );
}
