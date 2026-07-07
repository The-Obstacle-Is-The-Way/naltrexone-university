'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { SessionBreakdownList } from '@/app/(app)/app/shared/components/session-breakdown-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDuration } from '@/lib/format-duration';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { LoadState } from '../../practice-page-logic';
import { focusElementWithoutScroll } from './focus-element-without-scroll';

export function SessionSummaryView({
  summary,
  review,
  reviewLoadState,
  onReviewAnswers,
  onOpenReviewQuestion,
  isReviewLoading = false,
  reviewEntryErrorMessage = null,
}: {
  summary: EndPracticeSessionOutput;
  review?: GetPracticeSessionReviewOutput | null | undefined;
  reviewLoadState?: LoadState | undefined;
  onReviewAnswers?: (() => void) | undefined;
  onOpenReviewQuestion?: ((questionId: string) => void) | undefined;
  isReviewLoading?: boolean | undefined;
  reviewEntryErrorMessage?: string | null | undefined;
}) {
  const summaryReview = review ?? null;
  const summaryReviewLoadState = reviewLoadState ?? { status: 'idle' };
  const accuracyPercent = `${Math.round(summary.totals.accuracy * 100)}%`;
  const accuracyLabel =
    summary.mode === 'exam' || summary.totals.answered > 0
      ? accuracyPercent
      : '—';
  const firstReviewableSlug =
    summary.mode === 'exam'
      ? (summaryReview?.rows.find((row) => row.isAvailable)?.slug ?? null)
      : null;
  const hasInSessionReviewAction =
    summary.mode === 'exam' && typeof onReviewAnswers === 'function';
  const hasPrimaryFollowUp =
    hasInSessionReviewAction || firstReviewableSlug !== null;
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    focusElementWithoutScroll(headingRef.current);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1
          ref={headingRef}
          className="text-2xl font-bold font-heading tracking-tight text-foreground outline-none ring-focus"
          tabIndex={-1}
        >
          Session Summary
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Here&apos;s how you did.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 rounded-2xl p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Answered</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.answered}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Correct</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.correct}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Accuracy</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {accuracyLabel}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">Duration</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatDuration(summary.totals.durationSeconds)}
          </div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">
          Question breakdown
        </h2>
        {summaryReviewLoadState.status === 'loading' ? (
          <output
            className="mt-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            Loading question breakdown…
          </output>
        ) : null}
        {summaryReviewLoadState.status === 'error' ? (
          <div className="mt-2 text-sm text-destructive" role="alert">
            {summaryReviewLoadState.message}
          </div>
        ) : null}
        {summaryReview ? (
          <div className="mt-3">
            <SessionBreakdownList
              rows={summaryReview.rows}
              from="summary"
              sessionId={summary.sessionId}
              onOpenQuestion={onOpenReviewQuestion}
              isQuestionActionPending={isReviewLoading}
            />
          </div>
        ) : null}
      </Card>

      {reviewEntryErrorMessage ? (
        <div className="text-sm text-destructive" role="alert">
          {reviewEntryErrorMessage}
        </div>
      ) : null}
      {isReviewLoading ? (
        <output className="text-sm text-muted-foreground" aria-live="polite">
          Loading review...
        </output>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {hasInSessionReviewAction ? (
          <Button
            type="button"
            className="rounded-full"
            onClick={onReviewAnswers}
            disabled={isReviewLoading}
          >
            Review Answers
          </Button>
        ) : firstReviewableSlug ? (
          <Button asChild className="rounded-full">
            <Link
              href={toQuestionRoute(firstReviewableSlug, {
                from: 'summary',
                mode: 'review',
                sessionId: summary.sessionId,
              })}
            >
              Review Answers
            </Link>
          </Button>
        ) : null}
        <Button
          asChild
          className="rounded-full"
          variant={hasPrimaryFollowUp ? 'outline' : 'default'}
        >
          <Link href={ROUTES.APP_PRACTICE}>New Session</Link>
        </Button>
      </div>
    </div>
  );
}
