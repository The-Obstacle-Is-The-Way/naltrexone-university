import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { MetallicBorder } from './metallic-border';

interface MetallicCtaButtonProps {
  children: ReactNode;
  href?: string;
  className?: string;
}

export function MetallicCtaButton({
  children,
  href,
  className,
}: MetallicCtaButtonProps) {
  const inner = (
    <span className="flex items-center gap-2 px-8 py-3 text-base font-medium text-foreground">
      {children}
      <ArrowRight className="h-4 w-4" />
    </span>
  );

  const content = href ? <a href={href}>{inner}</a> : <span>{inner}</span>;

  return (
    <MetallicBorder borderRadius={9999} borderWidth={2} className={className}>
      {content}
    </MetallicBorder>
  );
}
