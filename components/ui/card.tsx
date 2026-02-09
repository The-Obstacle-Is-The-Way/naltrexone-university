import type * as React from 'react';

import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-0 rounded-2xl border p-6 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Card };
