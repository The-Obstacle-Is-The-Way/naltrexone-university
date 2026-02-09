import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/lib/routes';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { SessionBreakdownList } from '../../components/session-breakdown-list';
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
        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Answered</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.answered}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Correct</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {summary.totals.correct}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Accuracy</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {accuracyPercent}%
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Duration</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatDuration(summary.totals.durationSeconds)}
          </div>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-medium text-foreground">
          Question breakdown
        </div>
        {summaryReviewLoadState.status === 'loading' ? (
          <output
            className="mt-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            Loading question breakdown…
          </output>
        ) : null}
        {summaryReviewLoadState.status === 'error' ? (
          <div className="mt-2 text-sm text-destructive" role="alert">
            {summaryReviewLoadState.message}
          </div>
        ) : null}
        {summaryReview ? (
          <div className="mt-3">
            <SessionBreakdownList rows={summaryReview.rows} />
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild className="rounded-full">
          <Link href={ROUTES.APP_DASHBOARD}>Back to Dashboard</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={ROUTES.APP_PRACTICE}>Start another session</Link>
        </Button>
      </div>
    </div>
  );
}
