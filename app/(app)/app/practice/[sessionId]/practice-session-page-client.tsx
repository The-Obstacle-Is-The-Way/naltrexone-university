'use client';

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
  const props = usePracticeSessionPageController(sessionId);
  return <PracticeSessionPageView {...props} />;
}
