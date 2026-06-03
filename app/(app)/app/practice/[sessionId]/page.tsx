import type { Metadata } from 'next';
import { awaitRequestBoundary } from '@/app/(app)/app/request-boundary';
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

export type { PracticeSessionPageViewProps };
export { isQuestionBookmarked, PracticeSessionPageView, SessionSummaryView };

export default async function PracticeSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestBoundary = awaitRequestBoundary();
  const paramsPromise = Promise.resolve(params);
  const searchParamsPromise = Promise.resolve(searchParams);

  await requestBoundary;

  const [{ sessionId }, resolvedSearchParams] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
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
