import { Button } from '@/components/ui/button';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';

export function QuestionNavigator({
  review,
  currentQuestionId,
  onNavigateQuestion,
}: {
  review: GetPracticeSessionReviewOutput;
  currentQuestionId: string | null;
  onNavigateQuestion: (questionId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-sm font-medium text-foreground">
        Question navigator
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {review.rows.map((row) => {
          const isCurrent = row.questionId === currentQuestionId;
          const statusLabel = row.isAnswered
            ? row.isCorrect === null
              ? 'Answered'
              : row.isCorrect
                ? 'Correct'
                : 'Incorrect'
            : 'Unanswered';

          return (
            <Button
              key={row.questionId}
              type="button"
              variant={isCurrent ? 'default' : 'outline'}
              className="rounded-full"
              disabled={!row.isAvailable}
              onClick={() => onNavigateQuestion(row.questionId)}
              aria-label={`Question ${row.order}: ${statusLabel}`}
            >
              {row.order}
            </Button>
          );
        })}
      </div>
    </div>
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
  onFinalizeReview: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Review Questions
        </h1>
        <p className="mt-1 text-muted-foreground">
          Check answered, unanswered, and marked questions before final submit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Answered</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.answeredCount}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Unanswered</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.totalCount - review.answeredCount}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Marked</div>
          <div className="mt-1 text-2xl font-bold font-display text-foreground">
            {review.markedCount}
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {review.rows.map((row) => (
          <li
            key={row.questionId}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
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
                  onClick={() => onOpenQuestion(row.questionId)}
                >
                  Open question
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          className="rounded-full"
          disabled={isPending}
          onClick={onFinalizeReview}
        >
          Submit exam
        </Button>
      </div>
    </div>
  );
}
