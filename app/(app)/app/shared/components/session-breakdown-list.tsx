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
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.questionId}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          {row.isAvailable ? (
            <Link
              href={toQuestionRoute(row.slug, {
                from,
                mode: 'review',
                sessionId,
                historyHref,
              })}
              className="flex items-center gap-2 font-medium text-foreground hover:underline"
            >
              <span>{row.order}.</span>
              <span>{getStemPreview(row.stemMd, STEM_PREVIEW_LENGTH)}</span>
            </Link>
          ) : (
            <>
              <span className="font-medium text-foreground">{row.order}.</span>
              <span className="font-medium text-foreground">
                [Question no longer available]
              </span>
            </>
          )}
          {row.isAnswered ? (
            row.isCorrect === true ? (
              <span className="text-success">Correct</span>
            ) : row.isCorrect === false ? (
              <span className="text-destructive">Incorrect</span>
            ) : null
          ) : (
            <span className="text-muted-foreground/60">Unanswered</span>
          )}
        </li>
      ))}
    </ul>
  );
}
