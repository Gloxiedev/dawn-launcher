import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  icon?: ReactNode;
}

export function Button({ className, tone = 'secondary', icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition duration-150 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'bg-[var(--accent)] text-black shadow-glow hover:brightness-110',
        tone === 'secondary' && 'border border-subtle bg-surface-muted text-primary hover:bg-surface-hover hover:border-accent/30',
        tone === 'ghost' && 'text-muted hover:bg-surface-hover hover:text-primary',
        tone === 'danger' && 'border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
