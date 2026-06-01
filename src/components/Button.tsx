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
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition duration-150 focus:outline-none focus:ring-2 focus:ring-orange-400/60 disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'bg-[var(--accent)] text-black shadow-glow hover:brightness-110',
        tone === 'secondary' && 'border border-white/10 bg-white/[0.07] text-zinc-100 hover:bg-white/[0.11]',
        tone === 'ghost' && 'text-zinc-300 hover:bg-white/[0.08] hover:text-white',
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
