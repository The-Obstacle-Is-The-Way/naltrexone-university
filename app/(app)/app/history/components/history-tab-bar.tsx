import Link from 'next/link';
import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from '@/components/ui/tab-switch-styles';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function HistoryTabBar({
  activeTab,
}: {
  activeTab: 'sessions' | 'questions';
}) {
  return (
    <nav aria-label="History tabs">
      <div className={tabSwitchContainerClasses}>
        <Link
          href={`${ROUTES.APP_HISTORY}?tab=sessions`}
          aria-current={activeTab === 'sessions' ? 'page' : undefined}
          className={cn(
            tabSwitchItemBaseClasses,
            activeTab === 'sessions'
              ? tabSwitchItemActiveClasses
              : tabSwitchItemInactiveClasses,
          )}
        >
          Sessions
        </Link>
        <Link
          href={`${ROUTES.APP_HISTORY}?tab=questions`}
          aria-current={activeTab === 'questions' ? 'page' : undefined}
          className={cn(
            tabSwitchItemBaseClasses,
            activeTab === 'questions'
              ? tabSwitchItemActiveClasses
              : tabSwitchItemInactiveClasses,
          )}
        >
          Questions
        </Link>
      </div>
    </nav>
  );
}
