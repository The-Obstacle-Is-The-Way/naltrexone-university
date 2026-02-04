import type { ReactNode } from 'react';

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
  const innerRadius = borderRadius - borderWidth;

  return (
    <div
      className={`metallic-border inline-flex${className ? ` ${className}` : ''}`}
      style={{
        borderRadius: `${borderRadius}px`,
        padding: `${borderWidth}px`,
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
