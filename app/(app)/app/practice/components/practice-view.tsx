'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { ErrorCard } from '@/components/error-card';
import { QuestionSurfaceBody } from '@/components/question/question-surface-body';
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
  endSessionLabel?: string;
  questionPanelId?: string;
  questionAreaRef?: React.RefObject<HTMLElement | null>;
  onEndSession?: () => void;
  onRetryBookmarks?: () => void;
  onTryAgain: () => void;
  onToggleBookmark: () => void;
  onToggleMarkForReview?: () => void;
  onSelectChoice: (choiceId: string) => void;
  onNextQuestion: () => void;
  onPreviousQuestion?: () => void;
  hasPreviousQuestion?: boolean;
  canNavigatePrevious?: boolean;
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

type TutorActionBarProps = Pick<
  PracticeViewProps,
  | 'bookmarkStatus'
  | 'hasNextQuestion'
  | 'hasPreviousQuestion'
  | 'canNavigatePrevious'
  | 'isBookmarked'
  | 'isPending'
  | 'loadState'
  | 'onEndSession'
  | 'onNextQuestion'
  | 'onPreviousQuestion'
  | 'onToggleBookmark'
  | 'submitResult'
>;

function TutorActionBar(props: TutorActionBarProps) {
  const isActionBarDisabled =
    props.isPending || props.loadState.status === 'loading';
  const isPreviousDisabled =
    isActionBarDisabled || props.canNavigatePrevious === false;
  const isLastQuestion = props.hasNextQuestion === false;
  const hasPreviousAction = !!(
    props.onPreviousQuestion && props.hasPreviousQuestion
  );
  const hasNextAction = !isLastQuestion && props.submitResult !== null;
  const hasEndSessionAction = !!(
    isLastQuestion &&
    props.submitResult !== null &&
    props.onEndSession
  );
  const hasPrimaryActions =
    hasPreviousAction || hasNextAction || hasEndSessionAction;

  const navigationGroup = hasPrimaryActions ? (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="tutor-action-primary-group"
    >
      {hasPreviousAction ? (
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={isPreviousDisabled}
          onClick={props.onPreviousQuestion}
        >
          Previous
        </Button>
      ) : null}

      {hasEndSessionAction ? (
        <Button
          type="button"
          variant="default"
          className="rounded-full"
          disabled={isActionBarDisabled}
          onClick={props.onEndSession}
        >
          End session
        </Button>
      ) : null}

      {hasNextAction ? (
        <Button
          type="button"
          variant="default"
          className="rounded-full"
          disabled={isActionBarDisabled}
          onClick={props.onNextQuestion}
        >
          Next
        </Button>
      ) : null}
    </div>
  ) : null;

  const secondaryGroup = hasBooleanCorrectness(props.submitResult) ? (
    <div
      className="flex flex-wrap items-center gap-3 sm:ml-auto"
      data-testid="tutor-action-secondary-group"
    >
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        aria-pressed={props.isBookmarked}
        disabled={
          props.bookmarkStatus === 'loading' ||
          props.bookmarkStatus === 'error' ||
          isActionBarDisabled
        }
        onClick={props.onToggleBookmark}
      >
        {props.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
      </Button>
    </div>
  ) : null;

  return (
    <>
      {navigationGroup}
      {secondaryGroup}
    </>
  );
}

type ExamActionBarProps = Pick<
  PracticeViewProps,
  | 'hasPreviousQuestion'
  | 'canNavigatePrevious'
  | 'isPending'
  | 'loadState'
  | 'onEndSession'
  | 'onNextQuestion'
  | 'onPreviousQuestion'
> & {
  isLastSessionQuestion: boolean;
};

function ExamActionBar(props: ExamActionBarProps) {
  const isNavigationDisabled =
    props.isPending || props.loadState.status === 'loading';
  const isPreviousDisabled =
    isNavigationDisabled || props.canNavigatePrevious === false;
  const nextActionDescriptionId = useId();
  const nextActionDescription =
    props.isLastSessionQuestion && props.onEndSession
      ? 'Opens review and submit.'
      : null;
  const onMiddleAction =
    props.isLastSessionQuestion && props.onEndSession
      ? props.onEndSession
      : props.onNextQuestion;
  const navigationGroup =
    props.onPreviousQuestion && props.hasPreviousQuestion ? (
      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="exam-action-primary-group"
      >
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={isPreviousDisabled}
          onClick={props.onPreviousQuestion}
        >
          Previous
        </Button>
      </div>
    ) : null;

  const ctaGroup = (
    <div
      className="flex flex-wrap items-center gap-3 sm:ml-auto"
      data-testid="exam-action-cta-group"
    >
      {nextActionDescription ? (
        <span id={nextActionDescriptionId} className="sr-only">
          {nextActionDescription}
        </span>
      ) : null}

      <Button
        type="button"
        className="rounded-full"
        disabled={isNavigationDisabled}
        onClick={onMiddleAction}
        aria-describedby={
          nextActionDescription ? nextActionDescriptionId : undefined
        }
      >
        {props.isLastSessionQuestion && props.onEndSession
          ? 'Review & Submit'
          : 'Next'}
      </Button>
    </div>
  );

  return (
    <>
      {navigationGroup}
      {ctaGroup}
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
  const titleId = useId();
  const descriptionId = useId();
  const questionPanelLabelledBy = props.description ? descriptionId : titleId;
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

  const actionBar = props.question ? (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="bottom-action-bar"
    >
      {isExamMode ? (
        <ExamActionBar
          canNavigatePrevious={props.canNavigatePrevious}
          hasPreviousQuestion={props.hasPreviousQuestion}
          isLastSessionQuestion={isLastSessionQuestion}
          isPending={props.isPending}
          loadState={props.loadState}
          onEndSession={props.onEndSession}
          onNextQuestion={props.onNextQuestion}
          onPreviousQuestion={props.onPreviousQuestion}
        />
      ) : (
        <TutorActionBar
          bookmarkStatus={props.bookmarkStatus}
          canNavigatePrevious={props.canNavigatePrevious}
          hasNextQuestion={props.hasNextQuestion}
          hasPreviousQuestion={props.hasPreviousQuestion}
          isBookmarked={props.isBookmarked}
          isPending={props.isPending}
          loadState={props.loadState}
          onNextQuestion={props.onNextQuestion}
          onPreviousQuestion={props.onPreviousQuestion}
          onEndSession={props.onEndSession}
          onToggleBookmark={props.onToggleBookmark}
          submitResult={props.submitResult}
        />
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {props.topContent}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1
              id={titleId}
              className="text-2xl font-bold font-heading tracking-tight text-foreground"
            >
              {title}
            </h1>
            <p
              id={descriptionId}
              className="mt-1 text-base text-muted-foreground"
              aria-live="polite"
            >
              {description}
            </p>
          </div>
          <div
            className="flex items-center gap-3"
            data-testid="question-header-actions"
          >
            {isExamMode && props.onToggleMarkForReview ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                aria-pressed={isMarkedForReview}
                disabled={
                  props.isMarkingForReview ||
                  props.isPending ||
                  props.loadState.status === 'loading'
                }
                onClick={props.onToggleMarkForReview}
              >
                {isMarkedForReview ? 'Unmark review' : 'Mark for review'}
              </Button>
            ) : null}
            {props.onEndSession && !isExamMode ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={
                  props.isPending || props.loadState.status === 'loading'
                }
                onClick={props.onEndSession}
              >
                {endSessionLabel}
              </Button>
            ) : (!isExamMode && !props.onEndSession) ||
              (isExamMode && !props.onToggleMarkForReview) ? (
              <Button
                asChild
                variant="link"
                className={headerActionLinkClasses}
              >
                <Link href={backLink.href}>{backLink.label}</Link>
              </Button>
            ) : null}
          </div>
        </div>
        {props.belowHeadingContent}
      </div>

      <section
        id={props.questionPanelId}
        ref={props.questionAreaRef}
        data-testid="active-question-panel"
        aria-labelledby={questionPanelLabelledBy}
        tabIndex={-1}
        className="space-y-6 outline-none focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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

        {props.question || feedbackResult ? (
          <QuestionSurfaceBody
            question={props.question}
            selectedChoiceId={props.selectedChoiceId}
            correctChoiceId={correctChoiceId}
            disabled={
              props.isPending ||
              props.loadState.status === 'loading' ||
              isAnswerLocked
            }
            onSelectChoice={props.onSelectChoice}
            feedback={feedbackResult}
            feedbackRef={feedbackRef}
          />
        ) : null}
      </section>

      {actionBar}
    </div>
  );
}
