import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetallicBorderProps {
  children: ReactNode;
  className?: string;
  borderRadius?: number;
  borderWidth?: number;
}

export function MetallicBorder({
  children,
  className,
  borderRadius = 16,
  borderWidth = 2,
}: MetallicBorderProps) {
  const safeBorderRadius = Math.max(0, borderRadius);
  const safeBorderWidth = Math.max(0, borderWidth);
  const innerRadius = Math.max(0, safeBorderRadius - safeBorderWidth);

  return (
    <div
      className={cn('metallic-border inline-flex', className)}
      style={{
        borderRadius: `${safeBorderRadius}px`,
        padding: `${safeBorderWidth}px`,
      }}
    >
      <div
        className="flex-1 bg-background"
        style={{ borderRadius: `${innerRadius}px` }}
      >
        {children}
      </div>
    </div>
  );
}
