import type { Metadata } from 'next';
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
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const from =
    typeof resolvedSearchParams?.from === 'string'
      ? resolvedSearchParams.from
      : undefined;
  const mode =
    typeof resolvedSearchParams?.mode === 'string'
      ? resolvedSearchParams.mode
      : undefined;
  const sessionId =
    typeof resolvedSearchParams?.sessionId === 'string'
      ? resolvedSearchParams.sessionId
      : undefined;
  const attemptId =
    typeof resolvedSearchParams?.attemptId === 'string'
      ? resolvedSearchParams.attemptId
      : undefined;
  const historyHref =
    typeof resolvedSearchParams?.historyHref === 'string'
      ? resolvedSearchParams.historyHref
      : undefined;
  const historySeq =
    typeof resolvedSearchParams?.historySeq === 'string'
      ? resolvedSearchParams.historySeq
      : undefined;
  const historyIndex =
    typeof resolvedSearchParams?.historyIndex === 'string'
      ? resolvedSearchParams.historyIndex
      : undefined;
  const normalizedAttemptId =
    mode === 'review' && sessionId && attemptId ? undefined : attemptId;

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
