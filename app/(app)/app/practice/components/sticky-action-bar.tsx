'use client';

type StickyActionBarProps = {
  children: React.ReactNode;
};

type StickyActionBarLayoutProps = {
  children: React.ReactNode;
  actionBar?: React.ReactNode;
};

export function StickyActionBarLayout({
  children,
  actionBar,
}: StickyActionBarLayoutProps) {
  return (
    <div
      className="flex h-[calc(100dvh-var(--app-shell-chrome-height,8rem))] flex-col overflow-hidden"
      data-testid="sticky-action-bar-layout"
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto pb-6"
        data-testid="sticky-action-bar-scroll-region"
      >
        {children}
      </div>
      {actionBar ? <StickyActionBar>{actionBar}</StickyActionBar> : null}
    </div>
  );
}

export function StickyActionBar({ children }: StickyActionBarProps) {
  return (
    <div
      className="sticky bottom-0 z-10 border-t border-border/50 bg-background/80 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-sm"
      data-testid="sticky-action-bar"
    >
      {children}
    </div>
  );
}
