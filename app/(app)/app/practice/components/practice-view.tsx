'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ErrorCard } from '@/components/error-card';
import { Feedback } from '@/components/question/feedback';
import { QuestionCard } from '@/components/question/question-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNotification } from '@/components/ui/notification-provider';
import { ROUTES } from '@/lib/routes';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { LoadState } from '../practice-page-logic';

export type PracticeViewProps = {
  title?: string;
  description?: string;
  backLink?: {
    href: string;
    label: string;
  };
  topContent?: React.ReactNode;
  belowHeadingContent?: React.ReactNode;
  sessionInfo?: NextQuestion['session'];
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  isAnswered: boolean;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  isBookmarked: boolean;
  isMarkingForReview?: boolean;
  bookmarkMessage?: string | null;
  bookmarkMessageVersion?: number;
  canSubmit: boolean;
  endSessionLabel?: string;
  questionAreaRef?: React.RefObject<HTMLDivElement | null>;
  onEndSession?: () => void;
  onRetryBookmarks?: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  onNextQuestion: () => void;
  onPreviousQuestion?: () => void;
  hasPreviousQuestion?: boolean;
  hasNextQuestion?: boolean;
};

export function getBookmarkNotificationTransition(input: {
  message: string | null;
  version: number;
  bookmarkStatus: PracticeViewProps['bookmarkStatus'];
  lastKey: string | null;
}): {
  nextKey: string | null;
  notification: { message: string; tone: 'success' | 'error' } | null;
} {
  if (!input.message) {
    return { nextKey: null, notification: null };
  }

  const key = `${input.version}:${input.message}`;
  if (input.lastKey === key) {
    return { nextKey: key, notification: null };
  }

  return {
    nextKey: key,
    notification: {
      message: input.message,
      tone: input.bookmarkStatus === 'error' ? 'error' : 'success',
    },
  };
}

export function PracticeView(props: PracticeViewProps) {
  const { notify } = useNotification();
  const sessionInfo = props.sessionInfo ?? null;
  const isExamMode = sessionInfo?.mode === 'exam';
  const isMarkedForReview = !!sessionInfo?.isMarkedForReview;
  const title = props.title ?? 'Practice';
  const description = props.description ?? 'Answer one question at a time.';
  const endSessionLabel = props.endSessionLabel ?? 'End session';
  const backLink = props.backLink ?? {
    href: ROUTES.APP_DASHBOARD,
    label: 'Back to Dashboard',
  };
  const isAnswerLocked = props.isAnswered || props.submitResult !== null;
  const correctChoiceId = isExamMode
    ? null
    : (props.submitResult?.correctChoiceId ?? null);
  const isSubmittingAnswer =
    props.isPending &&
    props.loadState.status === 'ready' &&
    props.question !== null &&
    props.submitResult === null;
  const lastNotifiedBookmarkKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const transition = getBookmarkNotificationTransition({
      message: props.bookmarkMessage ?? null,
      version: props.bookmarkMessageVersion ?? 0,
      bookmarkStatus: props.bookmarkStatus,
      lastKey: lastNotifiedBookmarkKeyRef.current,
    });

    lastNotifiedBookmarkKeyRef.current = transition.nextKey;
    if (!transition.notification) return;

    notify(transition.notification);
  }, [
    notify,
    props.bookmarkMessage,
    props.bookmarkMessageVersion,
    props.bookmarkStatus,
  ]);

  return (
    <div className="space-y-6">
      {props.topContent}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1 text-muted-foreground" aria-live="polite">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {props.onEndSession ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={props.isPending}
                onClick={props.onEndSession}
              >
                {endSessionLabel}
              </Button>
            ) : (
              <Button
                asChild
                variant="link"
                className="h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline"
              >
                <Link href={backLink.href}>{backLink.label}</Link>
              </Button>
            )}
          </div>
        </div>
        {props.belowHeadingContent}
      </div>

      <div ref={props.questionAreaRef} tabIndex={-1} className="outline-none">
        {props.loadState.status === 'error' ? (
          <ErrorCard className="p-6">
            <div>{props.loadState.message}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={props.onTryAgain}
              >
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link href={ROUTES.APP_DASHBOARD}>Return to dashboard</Link>
              </Button>
            </div>
          </ErrorCard>
        ) : null}

        {props.loadState.status === 'loading' ? (
          <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
            <output aria-live="polite">Loading question…</output>
          </Card>
        ) : null}
      </div>

      {props.bookmarkStatus === 'error' ? (
        <ErrorCard className="p-6">
          <div>Bookmarks unavailable.</div>
          {props.onRetryBookmarks ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={props.onRetryBookmarks}
              >
                Retry bookmarks
              </Button>
            </div>
          ) : null}
        </ErrorCard>
      ) : null}

      {props.loadState.status === 'ready' && props.question === null ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          <div>No more questions found.</div>
          {props.onEndSession ? (
            <div className="mt-4">
              <Button
                type="button"
                className="rounded-full"
                disabled={props.isPending}
                onClick={props.onEndSession}
              >
                {endSessionLabel}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {props.question ? (
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
            isAnswerLocked
          }
          onSelectChoice={props.onSelectChoice}
        />
      ) : null}

      {props.submitResult && !isExamMode ? (
        <Feedback
          isCorrect={props.submitResult.isCorrect}
          explanationMd={props.submitResult.explanationMd}
          choiceExplanations={props.submitResult.choiceExplanations}
        />
      ) : null}

      {props.question ? (
        <div className="flex flex-wrap items-center gap-3">
          {props.onPreviousQuestion ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={
                !props.hasPreviousQuestion ||
                props.isPending ||
                props.loadState.status === 'loading'
              }
              onClick={props.onPreviousQuestion}
            >
              ← Previous
            </Button>
          ) : null}

          <Button
            type="button"
            className="rounded-full"
            disabled={!props.canSubmit || props.isPending}
            onClick={props.onSubmit}
          >
            {isSubmittingAnswer ? 'Submitting…' : 'Submit'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={
              props.hasNextQuestion === false ||
              props.isPending ||
              props.loadState.status === 'loading'
            }
            onClick={props.onNextQuestion}
          >
            Next →
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            aria-pressed={props.isBookmarked}
            disabled={props.bookmarkStatus === 'loading' || props.isPending}
            onClick={props.onToggleBookmark}
          >
            {props.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          </Button>

          {isExamMode && props.onToggleMarkForReview ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              aria-pressed={isMarkedForReview}
              disabled={props.isMarkingForReview || props.isPending}
              onClick={props.onToggleMarkForReview}
            >
              {isMarkedForReview ? 'Unmark review' : 'Mark for review'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
