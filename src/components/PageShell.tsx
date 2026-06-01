import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PageShellProps {
  children: ReactNode;
  aside?: ReactNode;
  asideWidth?: number;
  className?: string;
}

/**
 * Dual-column page layout: one scroll region below lg, independent column scroll at lg+.
 */
export function PageShell({ children, aside, asideWidth = 380, className }: PageShellProps) {
  if (!aside) {
    return (
      <div className={cn('h-full min-h-0 overflow-y-auto overscroll-contain pr-1', className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-cols-1 gap-5 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_var(--page-aside-width)] lg:overflow-hidden',
        className
      )}
      style={{ '--page-aside-width': `${asideWidth}px` } as CSSProperties}
    >
      <section className="min-h-0 min-w-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">{children}</section>
      <aside className="min-h-0 min-w-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">{aside}</aside>
    </div>
  );
}
