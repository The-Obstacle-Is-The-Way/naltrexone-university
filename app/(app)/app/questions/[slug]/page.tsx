import type { Metadata } from 'next';
import { normalizeSearchParam } from '@/lib/search-params';
import QuestionPageClient, {
  QuestionView,
  type QuestionViewProps,
} from './question-page-client';

export const maxDuration = 30;

export const metadata: Metadata = {
  title: 'Question - Addiction Boards',
};

export { QuestionView };
export type { QuestionViewProps };

export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    from?: string | string[];
    mode?: string | string[];
    sessionId?: string | string[];
    attemptId?: string | string[];
    historyHref?: string | string[];
    historySeq?: string | string[];
    historyIndex?: string | string[];
  }>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const from = normalizeSearchParam(resolvedSearchParams?.from);
  const mode = normalizeSearchParam(resolvedSearchParams?.mode);
  const sessionId = normalizeSearchParam(resolvedSearchParams?.sessionId);
  const attemptId = normalizeSearchParam(resolvedSearchParams?.attemptId);
  const historyHref = normalizeSearchParam(resolvedSearchParams?.historyHref);
  const historySeq = normalizeSearchParam(resolvedSearchParams?.historySeq);
  const historyIndex = normalizeSearchParam(resolvedSearchParams?.historyIndex);
  const normalizedAttemptId =
    mode === 'review' && sessionId && attemptId ? undefined : attemptId;

  if (mode === 'review' && sessionId && attemptId) {
    console.info('[Telemetry]', {
      event: 'review_identifier_normalized',
      mode,
      normalizedTo: 'sessionId',
      hadAttemptId: true,
      hadSessionId: true,
      slug,
      from,
    });
  }

  return (
    <QuestionPageClient
      slug={slug}
      from={from}
      mode={mode}
      sessionId={sessionId}
      attemptId={normalizedAttemptId}
      historyHref={historyHref}
      historySeq={historySeq}
      historyIndex={historyIndex}
    />
  );
}
