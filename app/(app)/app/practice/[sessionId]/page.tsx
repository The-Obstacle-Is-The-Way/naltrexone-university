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
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <PracticeSessionPageClient
      sessionId={sessionId}
      toast={resolvedSearchParams?.toast}
      requestedCount={resolvedSearchParams?.requestedCount}
      actualCount={resolvedSearchParams?.actualCount}
    />
  );
}
