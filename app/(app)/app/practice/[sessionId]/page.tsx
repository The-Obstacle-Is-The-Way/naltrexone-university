import type { Metadata } from 'next';
import { normalizeSearchParam } from '@/lib/search-params';
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
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ sessionId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <PracticeSessionPageClient
      sessionId={sessionId}
      toast={normalizeSearchParam(resolvedSearchParams?.toast)}
      requestedCount={normalizeSearchParam(
        resolvedSearchParams?.requestedCount,
      )}
      actualCount={normalizeSearchParam(resolvedSearchParams?.actualCount)}
    />
  );
}
