'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ReviewQuestionNavigator } from '@/app/(app)/app/questions/[slug]/components/review-question-navigator';
import { ErrorCard } from '@/components/error-card';
import { Feedback } from '@/components/question/feedback';
import { QuestionCard } from '@/components/question/question-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  type QuestionMode,
  type QuestionOrigin,
  ROUTES,
  toPracticeSessionRoute,
  toQuestionRoute,
} from '@/lib/routes';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type {
  LoadState,
  SessionNavigation,
  SessionUnansweredReveal,
} from './question-page-logic';
import { useQuestionPageController } from './use-question-page-controller';

// WHY: This file exceeds the 300-line soft guideline intentionally.
// DEBT-234 enforces a warning threshold at 350 lines; DEBT-224 keeps 300 as the design guideline.
// It is a deep module (Ousterhout) with a single responsibility: compose question review page UI with origin-aware navigation and controller wiring.
// Splitting would decouple route-origin parsing and navigation contracts from rendering, increasing risk of inconsistent back-link and session-navigation behavior.
// Reviewed in DEBT-224 audit (2026-02-18).
// Keep parseQuestionOrigin in sync with QuestionOrigin in '@/lib/routes'.
function parseQuestionOrigin(value: string | undefined): QuestionOrigin | null {
  if (value === 'dashboard') return value;
  if (value === 'bookmarks') return value;
  if (value === 'practice') return value;
  if (value === 'history') return value;
  return null;
}

function parseQuestionMode(value: string | undefined): QuestionMode | null {
  if (value === 'review') return value;
  return null;
}

function parseHistoryHref(value: string | undefined): string | null {
  if (!value) return null;
  const prefix = `${ROUTES.APP_HISTORY}?`;
  if (!value.startsWith(prefix)) return null;
  try {
    const parsed = new URL(value, 'http://localhost');
    const tab = parsed.searchParams.get('tab');
    if (tab !== 'sessions' && tab !== 'questions') return null;
    return value;
  } catch {
    return null;
  }
}

const MAX_HISTORY_SEQUENCE_LENGTH = 20;
const HISTORY_SEQUENCE_SLUG_PATTERN = /^[a-z0-9-]+$/;

export function parseHistorySequence(
  value: string | undefined,
): string[] | null {
  if (!value) return null;
  const slugs = value
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => HISTORY_SEQUENCE_SLUG_PATTERN.test(slug))
    .slice(0, MAX_HISTORY_SEQUENCE_LENGTH);

  if (slugs.length === 0) return null;
  return slugs;
}

function parseHistoryIndex(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function getOriginUi(
  origin: QuestionOrigin | null,
  sessionId?: string,
  historyHref?: string,
): {
  backHref: string;
  backLabel: string;
  subtitle: string;
} {
  const resolvedOrigin = origin ?? 'dashboard';
  const resolvedHistoryHref = parseHistoryHref(historyHref);

  if (resolvedOrigin === 'history') {
    return {
      backHref:
        resolvedHistoryHref ??
        (sessionId
          ? `${ROUTES.APP_HISTORY}?tab=sessions`
          : `${ROUTES.APP_HISTORY}?tab=questions`),
      backLabel: 'Back to History',
      subtitle: 'Reviewing a question from your history.',
    };
  }

  if (resolvedOrigin === 'bookmarks') {
    return {
      backHref: ROUTES.APP_BOOKMARKS,
      backLabel: 'Back to Bookmarks',
      subtitle: 'Reviewing a bookmarked question.',
    };
  }

  if (resolvedOrigin === 'practice') {
    return {
      backHref: sessionId
        ? toPracticeSessionRoute(sessionId)
        : ROUTES.APP_PRACTICE,
      backLabel: sessionId ? 'Back to Session' : 'Back to Practice',
      subtitle: 'Review a question from your practice history.',
    };
  }

  return {
    backHref: ROUTES.APP_DASHBOARD,
    backLabel: 'Back to Dashboard',
    subtitle: 'Review a question from your recent activity.',
  };
}

export type QuestionViewProps = {
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isLoadingPreviousAttempt?: boolean;
  sessionUnansweredReveal?: SessionUnansweredReveal | null;
  sessionNavigation: SessionNavigation | null;
  canSubmit: boolean;
  isPending: boolean;
  mode?: QuestionMode | null;
  origin?: QuestionOrigin | null;
  sessionId?: string;
  historyHref?: string;
  onTryAgain: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onReattempt: () => void;
};

export function QuestionView(props: QuestionViewProps) {
  const sessionUnansweredReveal = props.sessionUnansweredReveal ?? null;
  const isReviewMode = props.mode === 'review';
  const hasSessionId = typeof props.sessionId === 'string';
  const isSessionReviewReadOnly = isReviewMode && hasSessionId;
  const isSessionReviewUnansweredReveal = sessionUnansweredReveal !== null;
  const correctChoiceId =
    sessionUnansweredReveal?.correctChoiceId ??
    props.submitResult?.correctChoiceId ??
    null;
  const originUi = getOriginUi(
    props.origin ?? null,
    props.sessionId,
    props.historyHref,
  );
  const shouldShowTopBackLink = props.origin !== 'history';

  const navPrev =
    props.sessionNavigation && props.sessionNavigation.currentIndex > 0
      ? props.sessionNavigation.questions[
          props.sessionNavigation.currentIndex - 1
        ]
      : null;
  const navNext =
    props.sessionNavigation &&
    props.sessionNavigation.currentIndex <
      props.sessionNavigation.questions.length - 1
      ? props.sessionNavigation.questions[
          props.sessionNavigation.currentIndex + 1
        ]
      : null;
  const historySeqParam = props.sessionNavigation?.historySequence?.join(',');
  const reattemptLabel = props.submitResult?.isCorrect
    ? 'Practice Again'
    : 'Try Again';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Question
          </h1>
          <p className="mt-1 text-muted-foreground">{originUi.subtitle}</p>
        </div>
        {shouldShowTopBackLink ? (
          <Link
            href={originUi.backHref}
            className="rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {originUi.backLabel}
          </Link>
        ) : null}
      </div>

      {props.sessionNavigation ? (
        <>
          <ReviewQuestionNavigator
            navigation={props.sessionNavigation}
            historyHref={props.historyHref}
          />
          <p className="text-center text-sm text-muted-foreground">
            Question {props.sessionNavigation.currentIndex + 1} of{' '}
            {props.sessionNavigation.questions.length}
          </p>
        </>
      ) : null}

      {props.loadState.status === 'error' ? (
        <ErrorCard className="p-6">
          <div>{props.loadState.message}</div>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full"
            onClick={props.onTryAgain}
          >
            Try again
          </Button>
        </ErrorCard>
      ) : null}

      {props.loadState.status === 'loading' &&
      !props.isLoadingPreviousAttempt ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          <output aria-live="polite">Loading question…</output>
        </Card>
      ) : null}

      {props.loadState.status === 'ready' && props.isLoadingPreviousAttempt ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          <output aria-live="polite">Loading review…</output>
        </Card>
      ) : null}

      {props.loadState.status === 'ready' &&
      props.question === null &&
      !props.isLoadingPreviousAttempt ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          Question not found.
        </Card>
      ) : null}

      {props.question && !props.isLoadingPreviousAttempt ? (
        <>
          {isSessionReviewUnansweredReveal ? (
            <Card
              className="gap-0 rounded-2xl border-warning/50 bg-warning/5 p-4 text-sm text-foreground shadow-sm"
              role="status"
            >
              You did not answer this question during this session.
            </Card>
          ) : null}
          <QuestionCard
            stemMd={props.question.stemMd}
            choices={props.question.choices.map((c) => ({
              id: c.id,
              label: c.label,
              textMd: c.textMd,
            }))}
            selectedChoiceId={props.selectedChoiceId}
            correctChoiceId={correctChoiceId}
            disabled={
              props.isPending ||
              props.loadState.status === 'loading' ||
              isSessionReviewReadOnly
            }
            onSelectChoice={props.onSelectChoice}
          />
        </>
      ) : null}

      {(props.submitResult || sessionUnansweredReveal) &&
      !props.isLoadingPreviousAttempt ? (
        <Feedback
          isCorrect={props.submitResult?.isCorrect ?? false}
          explanationMd={
            props.submitResult?.explanationMd ??
            sessionUnansweredReveal?.explanationMd ??
            null
          }
          referenceMd={
            props.submitResult?.referenceMd ??
            sessionUnansweredReveal?.referenceMd ??
            null
          }
          choiceExplanations={
            props.submitResult?.choiceExplanations ??
            sessionUnansweredReveal?.choiceExplanations ??
            []
          }
          selectedChoiceId={props.selectedChoiceId}
        />
      ) : null}

      {!props.isLoadingPreviousAttempt ? (
        <div
          className="flex flex-col gap-3 sm:flex-row"
          data-testid="bottom-action-bar"
        >
          {props.sessionNavigation ? (
            navPrev ? (
              <Button asChild variant="outline" className="rounded-full">
                <Link
                  href={toQuestionRoute(navPrev.slug, {
                    from: props.sessionNavigation.from,
                    mode: 'review',
                    sessionId: props.sessionNavigation.sessionId,
                    historyHref: props.historyHref,
                    historySeq: historySeqParam,
                    historyIndex: historySeqParam
                      ? props.sessionNavigation.currentIndex - 1
                      : undefined,
                  })}
                >
                  ← Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="rounded-full" disabled>
                ← Previous
              </Button>
            )
          ) : null}

          {!props.submitResult && !isSessionReviewReadOnly ? (
            <Button
              type="button"
              className="rounded-full"
              disabled={
                !props.canSubmit ||
                props.isPending ||
                props.loadState.status === 'loading'
              }
              onClick={props.onSubmit}
            >
              Submit
            </Button>
          ) : null}

          {props.submitResult && !isSessionReviewReadOnly ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={props.isPending}
              onClick={props.onReattempt}
            >
              {reattemptLabel}
            </Button>
          ) : null}

          {props.sessionNavigation ? (
            navNext ? (
              <Button asChild variant="outline" className="rounded-full">
                <Link
                  href={toQuestionRoute(navNext.slug, {
                    from: props.sessionNavigation.from,
                    mode: 'review',
                    sessionId: props.sessionNavigation.sessionId,
                    historyHref: props.historyHref,
                    historySeq: historySeqParam,
                    historyIndex: historySeqParam
                      ? props.sessionNavigation.currentIndex + 1
                      : undefined,
                  })}
                >
                  Next →
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="rounded-full" disabled>
                Next →
              </Button>
            )
          ) : null}

          {props.origin === 'history' ||
          props.sessionNavigation ||
          props.submitResult ||
          isSessionReviewReadOnly ? (
            <Button asChild variant="ghost" className="rounded-full">
              <Link href={originUi.backHref}>{originUi.backLabel}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function QuestionPageClient({
  slug,
  from,
  mode,
  sessionId,
  attemptId,
  historyHref,
  historySeq,
  historyIndex,
}: {
  slug: string;
  from?: string;
  mode?: string;
  sessionId?: string;
  attemptId?: string;
  historyHref?: string;
  historySeq?: string;
  historyIndex?: string;
}) {
  const origin = parseQuestionOrigin(from);
  const parsedMode = parseQuestionMode(mode);
  const parsedHistorySequence = useMemo(
    () => parseHistorySequence(historySeq),
    [historySeq],
  );
  const parsedHistoryIndex = useMemo(
    () => parseHistoryIndex(historyIndex),
    [historyIndex],
  );
  const controller = useQuestionPageController({
    slug,
    mode: parsedMode,
    from: origin,
    sessionId,
    attemptId,
    historySequence: parsedHistorySequence,
    historyIndex: parsedHistoryIndex,
  });
  return (
    <QuestionView
      {...controller}
      mode={parsedMode}
      origin={origin}
      sessionId={sessionId}
      historyHref={historyHref}
    />
  );
}
