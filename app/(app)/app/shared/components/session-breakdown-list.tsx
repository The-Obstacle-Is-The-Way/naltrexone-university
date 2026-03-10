import Link from 'next/link';
import { type QuestionOrigin, toQuestionRoute } from '@/lib/routes';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import type { PracticeSessionReviewRow } from '@/src/application/use-cases';

const STEM_PREVIEW_LENGTH = 80;

export function SessionBreakdownList({
  rows,
  from = 'practice',
  sessionId,
  historyHref,
}: {
  rows: PracticeSessionReviewRow[];
  from?: QuestionOrigin;
  sessionId?: string;
  historyHref?: string;
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
          {row.isAvailable ? (
            <Link
              href={toQuestionRoute(row.slug, {
                from,
                mode: 'review',
                sessionId,
                historyHref,
              })}
              className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 font-medium text-foreground transition-colors hover:bg-muted/20 hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
          {row.isAnswered ? (
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
