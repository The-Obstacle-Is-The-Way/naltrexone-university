'use client';

import { Fragment, useRef } from 'react';
import {
  fireAndForget,
  logUnhandledAsyncError,
} from '@/app/(app)/app/practice/fire-and-forget';
import { ReviewCorrectnessBadge } from '@/app/(app)/app/shared/components/review-correctness-badge';
import {
  getReviewStatusLabel,
  getReviewVariant,
} from '@/app/(app)/app/shared/components/review-navigator-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import type {
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/application/use-cases';

type NavigatorReview =
  | GetPracticeSessionReviewOutput
  | GetCompletedSessionQuestionsWithFeedbackOutput;

export function QuestionNavigator({
  review,
  currentQuestionId,
  controlledPanelId,
  mode = 'exam',
  onNavigateQuestion,
}: {
  review: NavigatorReview;
  currentQuestionId: string | null;
  controlledPanelId: string;
  mode?: 'exam' | 'review';
  onNavigateQuestion: (questionId: string) => void;
}) {
  return (
    <nav aria-label="Question navigator">
      <Card className="gap-0 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">
          Question navigator
        </h2>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
          {review.rows.map((row) => {
            const isCurrent = row.questionId === currentQuestionId;
            const answeredLabel =
              mode === 'review'
                ? getReviewStatusLabel(row.isCorrect)
                : row.isAnswered
                  ? review.mode === 'tutor'
                    ? row.isCorrect === true
                      ? 'Correct'
                      : row.isCorrect === false
                        ? 'Incorrect'
                        : 'Answered'
                    : 'Answered'
                  : 'Unanswered';
            const statusParts = [
              ...(isCurrent ? (['Current'] as const) : []),
              ...(row.markedForReview ? (['Marked for review'] as const) : []),
              answeredLabel,
            ];

            const variant =
              mode === 'review'
                ? getReviewVariant(row.isCorrect)
                : isCurrent
                  ? 'default'
                  : row.isAnswered
                    ? 'secondary'
                    : 'outline';

            return (
              <Button
                key={row.questionId}
                type="button"
                variant={variant}
                className={cn(
                  'relative rounded-full',
                  mode === 'review' && isCurrent && 'ring-[3px] ring-ring/50',
                )}
                disabled={!row.isAvailable}
                onClick={() => onNavigateQuestion(row.questionId)}
                aria-label={`Question ${row.order}: ${statusParts.join(', ')}`}
                aria-current={isCurrent ? 'step' : undefined}
                aria-controls={controlledPanelId}
              >
                {row.order}
                {mode === 'review' ? (
                  <ReviewCorrectnessBadge isCorrect={row.isCorrect} />
                ) : null}
                {row.markedForReview ? (
                  <span
                    aria-hidden="true"
                    data-testid="question-nav-marked-dot"
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary"
                  />
                ) : null}
              </Button>
            );
          })}
        </div>
      </Card>
    </nav>
  );
}

export function ExamReviewView({
  review,
  isPending,
  onOpenQuestion,
  onFinalizeReview,
}: {
  review: GetPracticeSessionReviewOutput;
  isPending: boolean;
  onOpenQuestion: (questionId: string) => void;
  onFinalizeReview: () => Promise<void>;
}) {
  const unansweredCount = review.totalCount - review.answeredCount;
  const isFinalizingRef = useRef(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Review & Submit
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Check answered, unanswered, and marked questions before final submit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-0 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Answered</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.answeredCount}
          </div>
        </Card>
        <Card className="gap-0 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Unanswered</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {unansweredCount}
          </div>
        </Card>
        <Card className="gap-0 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Marked</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.markedCount}
          </div>
        </Card>
      </div>

      <ul className="space-y-3">
        {review.rows.map((row) => {
          const metadataItems = [
            row.isAnswered ? 'Answered' : 'Unanswered',
            ...(row.markedForReview ? ['Marked for review'] : []),
            ...(row.isAnswered && row.isCorrect !== null
              ? [row.isCorrect ? 'Correct' : 'Incorrect']
              : []),
          ];
          const stemPreview = row.isAvailable
            ? getStemPreview(row.stemMd, 96)
            : '[Question no longer available]';
          const rowContent = (
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {row.order}. {stemPreview}
              </div>
              <div className="text-xs text-muted-foreground">
                {metadataItems.map((item, index) => (
                  <Fragment key={`${row.questionId}-${item}`}>
                    {index > 0 ? <span className="mx-2">•</span> : null}
                    <span>{item}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          );

          return (
            <li key={row.questionId}>
              {row.isAvailable ? (
                <button
                  type="button"
                  className={cn(
                    'bg-card text-card-foreground block w-full rounded-2xl border p-4 text-left shadow-sm transition-colors',
                    'hover:bg-muted/20 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  )}
                  onClick={() => onOpenQuestion(row.questionId)}
                >
                  <span className="sr-only">Open question </span>
                  {rowContent}
                </button>
              ) : (
                <Card className="gap-0 rounded-2xl p-4 shadow-sm">
                  {rowContent}
                </Card>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" className="rounded-full" disabled={isPending}>
              {isPending ? 'Submitting…' : 'Submit exam'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit exam?</AlertDialogTitle>
              <AlertDialogDescription>
                This will end the session and save your results.
                {unansweredCount > 0 ? (
                  <span className="mt-2 block text-destructive">
                    You have {unansweredCount} unanswered{' '}
                    {unansweredCount === 1 ? 'question' : 'questions'} that will
                    be scored as incorrect.
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">
                Keep reviewing
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  if (isPending) return;
                  if (isFinalizingRef.current) return;
                  isFinalizingRef.current = true;

                  fireAndForget(
                    Promise.resolve()
                      .then(() => onFinalizeReview())
                      .finally(() => {
                        isFinalizingRef.current = false;
                      }),
                    logUnhandledAsyncError,
                  );
                }}
              >
                Confirm submit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
