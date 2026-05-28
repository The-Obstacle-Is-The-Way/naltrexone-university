import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { type QuestionOrigin, toQuestionRoute } from '@/lib/routes';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import type { PracticeSessionReviewRow } from '@/src/application/use-cases';

const STEM_PREVIEW_LENGTH = 80;

// Transitional DEBT-399 PR 3 row styling. PR 4 owns the /20 hover-opacity
// alignment before this can promote into a semantic Button variant.
const questionActionButtonClasses =
  '-mx-2 flex h-auto min-w-0 flex-1 shrink items-center justify-start gap-2 rounded-md bg-transparent px-2 py-0 text-left font-medium text-foreground shadow-none whitespace-normal hover:bg-muted/20 hover:text-foreground';

export function SessionBreakdownList({
  rows,
  from = 'practice',
  sessionId,
  historyHref,
  onOpenQuestion,
  isQuestionActionPending = false,
}: {
  rows: PracticeSessionReviewRow[];
  from?: QuestionOrigin;
  sessionId?: string;
  historyHref?: string;
  onOpenQuestion?: (questionId: string) => void;
  isQuestionActionPending?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No questions available for this session.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/20 dark:divide-foreground/20">
      {rows.map((row) => (
        <li
          key={row.questionId}
          className="flex items-center gap-2 py-2 text-sm"
        >
          {row.isAvailable && onOpenQuestion ? (
            <Button
              type="button"
              variant="secondary"
              className={questionActionButtonClasses}
              disabled={isQuestionActionPending}
              onClick={() => onOpenQuestion(row.questionId)}
            >
              <span className="shrink-0">{row.order}.</span>
              <span className="truncate">
                {getStemPreview(row.stemMd, STEM_PREVIEW_LENGTH)}
              </span>
            </Button>
          ) : row.isAvailable ? (
            <Link
              href={toQuestionRoute(row.slug, {
                from,
                mode: 'review',
                sessionId,
                historyHref,
              })}
              className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 font-medium text-foreground transition-colors hover:bg-muted/20 ring-focus"
            >
              <span className="shrink-0">{row.order}.</span>
              <span className="truncate">
                {getStemPreview(row.stemMd, STEM_PREVIEW_LENGTH)}
              </span>
            </Link>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 font-medium text-foreground">
                {row.order}.
              </span>
              <span className="font-medium text-foreground">
                [Question no longer available]
              </span>
            </span>
          )}
          {row.isAnswered || row.isOmitted ? (
            row.isCorrect === true ? (
              <span className="ml-auto shrink-0 text-success">Correct</span>
            ) : row.isCorrect === false ? (
              <span className="ml-auto shrink-0 text-destructive">
                Incorrect
              </span>
            ) : null
          ) : (
            <span className="ml-auto shrink-0 text-muted-foreground">
              Unanswered
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
