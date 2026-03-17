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
import { headerActionLinkClasses } from '@/lib/shared-styles';
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
  questionPanelId?: string;
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

function hasBooleanCorrectness(
  submitResult: SubmitAnswerOutput | null,
): submitResult is SubmitAnswerOutput & { isCorrect: boolean } {
  return submitResult !== null && typeof submitResult.isCorrect === 'boolean';
}

function ActionBarSpacer() {
  return <span aria-hidden="true" className="h-9 min-w-24" />;
}

type TutorActionBarProps = Pick<
  PracticeViewProps,
  | 'bookmarkStatus'
  | 'canSubmit'
  | 'hasNextQuestion'
  | 'hasPreviousQuestion'
  | 'isBookmarked'
  | 'isPending'
  | 'loadState'
  | 'onNextQuestion'
  | 'onPreviousQuestion'
  | 'onSubmit'
  | 'onToggleBookmark'
  | 'submitResult'
> & {
  isSubmittingAnswer: boolean;
};

function TutorActionBar(props: TutorActionBarProps) {
  return (
    <>
      {props.onPreviousQuestion ? (
        props.hasPreviousQuestion ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={props.isPending || props.loadState.status === 'loading'}
            onClick={props.onPreviousQuestion}
          >
            Previous
          </Button>
        ) : (
          <ActionBarSpacer />
        )
      ) : null}

      {!props.submitResult ? (
        <Button
          type="button"
          className="rounded-full"
          disabled={!props.canSubmit || props.isPending}
          onClick={props.onSubmit}
        >
          {props.isSubmittingAnswer ? 'Submitting…' : 'Submit'}
        </Button>
      ) : null}

      {props.hasNextQuestion === false ? (
        <ActionBarSpacer />
      ) : (
        <Button
          type="button"
          variant={props.submitResult ? 'default' : 'outline'}
          className="rounded-full"
          disabled={props.isPending || props.loadState.status === 'loading'}
          onClick={props.onNextQuestion}
        >
          Next
        </Button>
      )}

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
    </>
  );
}

type ExamActionBarProps = Pick<
  PracticeViewProps,
  | 'hasPreviousQuestion'
  | 'isMarkingForReview'
  | 'isPending'
  | 'loadState'
  | 'onEndSession'
  | 'onNextQuestion'
  | 'onPreviousQuestion'
  | 'onToggleMarkForReview'
> & {
  isLastSessionQuestion: boolean;
  isMarkedForReview: boolean;
};

function ExamActionBar(props: ExamActionBarProps) {
  const isNavigationDisabled =
    props.isPending || props.loadState.status === 'loading';
  const middleLabel =
    props.isLastSessionQuestion && props.onEndSession
      ? 'Review answers'
      : 'Next';
  const onMiddleAction =
    props.isLastSessionQuestion && props.onEndSession
      ? props.onEndSession
      : props.onNextQuestion;

  return (
    <>
      {props.onPreviousQuestion ? (
        props.hasPreviousQuestion ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={isNavigationDisabled}
            onClick={props.onPreviousQuestion}
          >
            Previous
          </Button>
        ) : (
          <ActionBarSpacer />
        )
      ) : null}

      <Button
        type="button"
        className="rounded-full"
        disabled={isNavigationDisabled}
        onClick={onMiddleAction}
      >
        {middleLabel}
      </Button>

      {props.onToggleMarkForReview ? (
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          aria-pressed={props.isMarkedForReview}
          disabled={props.isMarkingForReview || props.isPending}
          onClick={props.onToggleMarkForReview}
        >
          {props.isMarkedForReview ? 'Unmark review' : 'Mark for review'}
        </Button>
      ) : null}
    </>
  );
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
  const isLastSessionQuestion =
    sessionInfo !== null &&
    typeof sessionInfo.index === 'number' &&
    typeof sessionInfo.total === 'number' &&
    sessionInfo.index >= sessionInfo.total - 1;
  const isAnswerLocked = props.isAnswered || props.submitResult !== null;
  const correctChoiceId = isExamMode
    ? null
    : (props.submitResult?.correctChoiceId ?? null);
  const isSubmittingAnswer =
    props.isPending &&
    props.loadState.status === 'ready' &&
    props.question !== null &&
    props.submitResult === null;
  const feedbackResult =
    !isExamMode && hasBooleanCorrectness(props.submitResult)
      ? props.submitResult
      : null;
  const lastNotifiedBookmarkKeyRef = useRef<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!feedbackResult) return;
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [feedbackResult]);

  return (
    <div className="space-y-6">
      {props.topContent}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
              {title}
            </h1>
            <p
              className="mt-1 text-base text-muted-foreground"
              aria-live="polite"
            >
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
                className={headerActionLinkClasses}
              >
                <Link href={backLink.href}>{backLink.label}</Link>
              </Button>
            )}
          </div>
        </div>
        {props.belowHeadingContent}
      </div>

      <div
        id={props.questionPanelId}
        ref={props.questionAreaRef}
        tabIndex={-1}
        className="outline-none"
      >
        {props.loadState.status === 'error' ? (
          <ErrorCard>
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
        <ErrorCard>
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

      {feedbackResult ? (
        <div ref={feedbackRef}>
          <Feedback
            isCorrect={feedbackResult.isCorrect}
            explanationMd={feedbackResult.explanationMd}
            referenceMd={feedbackResult.referenceMd ?? null}
            choiceExplanations={feedbackResult.choiceExplanations}
            selectedChoiceId={props.selectedChoiceId}
          />
        </div>
      ) : null}

      {props.question ? (
        <div
          className="flex flex-wrap items-center gap-3"
          data-testid="bottom-action-bar"
        >
          {isExamMode ? (
            <ExamActionBar
              hasPreviousQuestion={props.hasPreviousQuestion}
              isLastSessionQuestion={isLastSessionQuestion}
              isMarkedForReview={isMarkedForReview}
              isMarkingForReview={props.isMarkingForReview}
              isPending={props.isPending}
              loadState={props.loadState}
              onEndSession={props.onEndSession}
              onNextQuestion={props.onNextQuestion}
              onPreviousQuestion={props.onPreviousQuestion}
              onToggleMarkForReview={props.onToggleMarkForReview}
            />
          ) : (
            <TutorActionBar
              bookmarkStatus={props.bookmarkStatus}
              canSubmit={props.canSubmit}
              hasNextQuestion={props.hasNextQuestion}
              hasPreviousQuestion={props.hasPreviousQuestion}
              isBookmarked={props.isBookmarked}
              isPending={props.isPending}
              isSubmittingAnswer={isSubmittingAnswer}
              loadState={props.loadState}
              onNextQuestion={props.onNextQuestion}
              onPreviousQuestion={props.onPreviousQuestion}
              onSubmit={props.onSubmit}
              onToggleBookmark={props.onToggleBookmark}
              submitResult={props.submitResult}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
