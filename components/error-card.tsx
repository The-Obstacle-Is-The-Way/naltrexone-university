import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ErrorCardProps = {
  children: ReactNode;
  className?: string;
};

export function ErrorCard({ children, className }: ErrorCardProps) {
  return (
    <div
      role="alert"
      data-error-card="true"
      className={cn(
        'rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
