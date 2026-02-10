import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

const baseTabClasses =
  'rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

export function HistoryTabBar({
  activeTab,
}: {
  activeTab: 'sessions' | 'missed';
}) {
  return (
    <nav aria-label="History tabs">
      <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 p-1">
        <Link
          href={`${ROUTES.APP_HISTORY}?tab=sessions`}
          aria-current={activeTab === 'sessions' ? 'page' : undefined}
          className={`${baseTabClasses} ${
            activeTab === 'sessions'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sessions
        </Link>
        <Link
          href={`${ROUTES.APP_HISTORY}?tab=missed`}
          aria-current={activeTab === 'missed' ? 'page' : undefined}
          className={`${baseTabClasses} ${
            activeTab === 'missed'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Missed Questions
        </Link>
      </div>
    </nav>
  );
}
