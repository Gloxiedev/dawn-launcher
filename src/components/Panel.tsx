import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-lg', className)} {...props} />;
}
