import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import type { LoadState } from '../../practice-page-logic';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function SessionSummaryView({
  summary,
  review,
  reviewLoadState,
}: {
  summary: EndPracticeSessionOutput;
  review?: GetPracticeSessionReviewOutput | null;
  reviewLoadState?: LoadState;
}) {
  const summaryReview = review ?? null;
  const summaryReviewLoadState = reviewLoadState ?? { status: 'idle' };
  const accuracyPercent = Math.round(summary.totals.accuracy * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Session Summary
        </h1>
        <p className="mt-1 text-muted-foreground">Here&apos;s how you did.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Answered</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.answered}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Correct</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.correct}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Accuracy</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {accuracyPercent}%
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-border/50 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Duration</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatDuration(summary.totals.durationSeconds)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="text-sm font-medium text-foreground">
          Question breakdown
        </div>
        {summaryReviewLoadState.status === 'loading' ? (
          <div className="mt-2 text-sm text-muted-foreground">
            Loading question breakdown…
          </div>
        ) : null}
        {summaryReviewLoadState.status === 'error' ? (
          <div className="mt-2 text-sm text-destructive">
            {summaryReviewLoadState.message}
          </div>
        ) : null}
        {summaryReview ? (
          <ul className="mt-3 space-y-2">
            {summaryReview.rows.map((row) => (
              <li
                key={row.questionId}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {row.order}.
                </span>
                <span className="font-medium text-foreground">
                  {row.isAvailable
                    ? getStemPreview(row.stemMd, 80)
                    : '[Question no longer available]'}
                </span>
                <span>{row.isAnswered ? 'Answered' : 'Unanswered'}</span>
                {row.isAnswered && row.isCorrect !== null ? (
                  <span>{row.isCorrect ? 'Correct' : 'Incorrect'}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild className="rounded-full">
          <Link href="/app/dashboard">Back to Dashboard</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/app/practice">Start another session</Link>
        </Button>
      </div>
    </div>
  );
}
