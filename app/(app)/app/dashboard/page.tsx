import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetSessionHistoryOutput,
  getSessionHistory,
} from '@/src/adapters/controllers/practice-controller';
import {
  getUserStats,
  type UserStatsOutput,
} from '@/src/adapters/controllers/stats-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';

export const metadata: Metadata = {
  title: 'Dashboard - Addiction Boards',
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toSentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const headerLinkButtonClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';

type DashboardViewProps = {
  stats: UserStatsOutput;
  sessionHistoryResult: ActionResult<GetSessionHistoryOutput>;
};

export function DashboardView({
  stats,
  sessionHistoryResult,
}: DashboardViewProps) {
  const historySessionsHref = `${ROUTES.APP_HISTORY}?tab=sessions`;
  const historyQuestionsHref = `${ROUTES.APP_HISTORY}?tab=questions`;
  const recentActivityRows = stats.recentActivity.slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Track your progress and keep your streak alive.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Total answered</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {stats.totalAnswered}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Overall accuracy</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatPercent(stats.accuracyOverall)}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Answered (7 days)</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {stats.answeredLast7Days}
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Accuracy (7 days)</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatPercent(stats.accuracyLast7Days)}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/50">
          <div className="text-sm text-muted-foreground">Current streak</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {stats.currentStreakDays}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Consecutive days with at least one answer.
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                Ready to practice?
              </div>
              <div className="text-sm text-muted-foreground">
                Start answering questions in tutor mode.
              </div>
            </div>
            <Button asChild className="rounded-full">
              <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 rounded-2xl p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium text-foreground">
              Recent sessions
            </div>
            <Button asChild variant="link" className={headerLinkButtonClasses}>
              <Link href={historySessionsHref}>View all</Link>
            </Button>
          </div>

          {!sessionHistoryResult.ok ? (
            <ErrorCard className="mt-4">
              {sessionHistoryResult.error.message}
            </ErrorCard>
          ) : sessionHistoryResult.data.rows.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">
              No completed sessions yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {sessionHistoryResult.data.rows.map((row) => (
                <li key={row.sessionId}>
                  <Link
                    href={historySessionsHref}
                    className="block rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {toSentenceCase(row.mode)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(row.endedAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      <span className="font-medium">
                        {row.correct}/{row.questionCount} correct
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        ({formatPercent(row.accuracy)})
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-0 rounded-2xl p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium text-foreground">
              Recent activity
            </div>
            <Button asChild variant="link" className={headerLinkButtonClasses}>
              <Link href={historyQuestionsHref}>View all</Link>
            </Button>
          </div>

          {recentActivityRows.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">
              No questions attempted yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {recentActivityRows.map((row) => {
                const resultLabel = row.isCorrect ? 'Correct' : 'Incorrect';
                const resultClass = row.isCorrect
                  ? 'text-emerald-500'
                  : 'text-destructive';

                if (!row.isAvailable) {
                  return (
                    <li key={row.attemptId}>
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                        <div className="text-sm font-medium text-foreground">
                          [Question no longer available]
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <span className={resultClass}>{resultLabel}</span>
                          <span className="mx-2">•</span>
                          <span>Answered {formatDate(row.answeredAt)}</span>
                        </div>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={row.attemptId}>
                    <Link
                      href={toQuestionRoute(row.slug, { from: 'dashboard' })}
                      className="block rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                          {getStemPreview(row.stemMd, 110)}
                        </span>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {toSentenceCase(row.difficulty)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span className={resultClass}>{resultLabel}</span>
                        <span className="mx-2">•</span>
                        <span>Answered {formatDate(row.answeredAt)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const [statsResult, sessionHistoryResult] = await Promise.all([
    getUserStats({}),
    getSessionHistory({ limit: 3, offset: 0 }),
  ]);

  return renderDashboard({
    statsResult,
    sessionHistoryResult,
  });
}

export function renderDashboard({
  statsResult,
  sessionHistoryResult,
}: {
  statsResult: ActionResult<UserStatsOutput>;
  sessionHistoryResult: ActionResult<GetSessionHistoryOutput>;
}) {
  if (!statsResult.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">Unable to load stats.</p>
        </div>
        <ErrorCard className="p-6">{statsResult.error.message}</ErrorCard>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
      </div>
    );
  }

  return (
    <DashboardView
      stats={statsResult.data}
      sessionHistoryResult={sessionHistoryResult}
    />
  );
}
