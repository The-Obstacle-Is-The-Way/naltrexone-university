'use client';

import { useRef } from 'react';
import {
  fireAndForget,
  logUnhandledAsyncError,
} from '@/app/(app)/app/practice/fire-and-forget';
import { ReviewCorrectnessBadge } from '@/app/(app)/app/shared/components/review-correctness-badge';
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
                ? row.isCorrect === true
                  ? 'Correct'
                  : row.isCorrect === false
                    ? 'Incorrect'
                    : 'Unanswered'
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
                ? row.isCorrect === true
                  ? 'success'
                  : row.isCorrect === false
                    ? 'destructive'
                    : 'outline'
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
        {review.rows.map((row) => (
          <li key={row.questionId}>
            <Card className="gap-0 rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {row.isAvailable
                      ? `${row.order}. ${getStemPreview(row.stemMd, 96)}`
                      : `${row.order}. [Question no longer available]`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.isAnswered ? 'Answered' : 'Unanswered'}
                    <span className="mx-2">•</span>
                    <span>
                      {row.markedForReview ? 'Marked for review' : 'Not marked'}
                    </span>
                    {row.isAnswered && row.isCorrect !== null ? (
                      <>
                        <span className="mx-2">•</span>
                        <span>{row.isCorrect ? 'Correct' : 'Incorrect'}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                {row.isAvailable ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    aria-label={
                      row.stemMd.trim()
                        ? `Open question ${row.order}: ${getStemPreview(
                            row.stemMd,
                            60,
                          )}`
                        : `Open question ${row.order}`
                    }
                    onClick={() => onOpenQuestion(row.questionId)}
                  >
                    Open question
                  </Button>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
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
