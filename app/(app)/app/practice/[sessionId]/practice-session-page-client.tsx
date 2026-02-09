'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/components/ui/notification-provider';
import {
  PracticeSessionPageView,
  type PracticeSessionPageViewProps,
} from './components/practice-session-page-view';
import { SessionSummaryView } from './components/session-summary-view';
import { usePracticeSessionPageController } from './hooks/use-practice-session-page-controller';
import { isQuestionBookmarked } from './practice-session-page-utils';

export { isQuestionBookmarked, PracticeSessionPageView, SessionSummaryView };
export type { PracticeSessionPageViewProps };

export default function PracticeSessionPageClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const { notify } = useNotification();
  const hasNotifiedRef = useRef(false);
  const props = usePracticeSessionPageController(sessionId);

  useEffect(() => {
    if (hasNotifiedRef.current) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get('toast') !== 'session_started') return;

    hasNotifiedRef.current = true;
    notify({ message: 'Session started.', tone: 'success' });

    url.searchParams.delete('toast');
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [notify]);

  return <PracticeSessionPageView {...props} />;
}
