'use client';

import {
  PracticeSessionPageView,
  type PracticeSessionPageViewProps,
} from './components/practice-session-page-view';
import { SessionSummaryView } from './components/session-summary-view';
import { usePracticeSessionPageController } from './hooks/use-practice-session-page-controller';
import { isQuestionBookmarked } from './practice-session-page-utils';
import { PracticeSessionToast } from './practice-session-toast';

export type { PracticeSessionPageViewProps };
export { isQuestionBookmarked, PracticeSessionPageView, SessionSummaryView };

export default function PracticeSessionPageClient({
  sessionId,
  toast,
  requestedCount,
  actualCount,
}: {
  sessionId: string;
  toast?: string;
  requestedCount?: string;
  actualCount?: string;
}) {
  const props = usePracticeSessionPageController(sessionId);

  return (
    <>
      <PracticeSessionToast
        code={toast}
        requestedCount={requestedCount}
        actualCount={actualCount}
      />
      <PracticeSessionPageView {...props} />
    </>
  );
}
