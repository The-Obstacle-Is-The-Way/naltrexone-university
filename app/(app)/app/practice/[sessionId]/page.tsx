import type { Metadata } from 'next';
import PracticeSessionPageClient, {
  isQuestionBookmarked,
  PracticeSessionPageView,
  type PracticeSessionPageViewProps,
  SessionSummaryView,
} from './practice-session-page-client';

export const metadata: Metadata = {
  title: 'Practice Session - Addiction Boards',
};

export { isQuestionBookmarked, PracticeSessionPageView, SessionSummaryView };
export type { PracticeSessionPageViewProps };

export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <PracticeSessionPageClient sessionId={sessionId} />;
}
