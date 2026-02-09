import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES, toPracticeSessionRoute, toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
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

type RecentActivityRow = UserStatsOutput['recentActivity'][number];

type RecentActivityGroup =
  | {
      kind: 'session';
      sessionId: string;
      sessionMode: 'tutor' | 'exam';
      rows: RecentActivityRow[];
    }
  | {
      kind: 'single';
      row: RecentActivityRow;
    };

function toSentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function groupRecentActivity(
  rows: readonly RecentActivityRow[],
): RecentActivityGroup[] {
  const groups: RecentActivityGroup[] = [];

  for (const row of rows) {
    if (row.sessionId && row.sessionMode) {
      const previous = groups[groups.length - 1];
      if (
        previous?.kind === 'session' &&
        previous.sessionId === row.sessionId
      ) {
        previous.rows.push(row);
        continue;
      }

      groups.push({
        kind: 'session',
        sessionId: row.sessionId,
        sessionMode: row.sessionMode,
        rows: [row],
      });
      continue;
    }

    groups.push({ kind: 'single', row });
  }

  return groups;
}

export function DashboardView({ stats }: { stats: UserStatsOutput }) {
  const recentActivityGroups = groupRecentActivity(stats.recentActivity);

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

      <Card className="gap-0 rounded-2xl p-6 shadow-sm">
        <div className="text-sm font-medium text-foreground">
          Recent activity
        </div>

        {recentActivityGroups.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">
            <div>No activity yet.</div>
            <div className="mt-2">
              Start practicing to see your recent answers here.
            </div>
            <div className="mt-4">
              <Button asChild variant="outline" className="rounded-full">
                <Link href={ROUTES.APP_PRACTICE}>Go to Practice →</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {recentActivityGroups.map((group) => {
              if (group.kind === 'single') {
                if (!group.row.isAvailable) {
                  return (
                    <li
                      key={group.row.attemptId}
                      className="flex items-center gap-2"
                    >
                      <span className="font-medium text-foreground">
                        [Question no longer available]
                      </span>
                      <span className="text-muted-foreground">
                        {group.row.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={group.row.attemptId}>
                    <Link
                      href={toQuestionRoute(group.row.slug, {
                        from: 'dashboard',
                      })}
                      className="flex items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <span className="min-w-0 flex-1 font-medium text-foreground">
                        {getStemPreview(group.row.stemMd, 100)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {toSentenceCase(group.row.difficulty)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {group.row.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </Link>
                  </li>
                );
              }

              const correctCount = group.rows.filter(
                (row) => row.isCorrect,
              ).length;

              return (
                <li
                  key={`session-${group.sessionId}`}
                  className="rounded-xl border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={toPracticeSessionRoute(group.sessionId)}
                      className="text-xs font-medium uppercase tracking-wide text-foreground transition-colors hover:text-foreground/90 hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      {toSentenceCase(group.sessionMode)} session
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {correctCount}/{group.rows.length} correct
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {group.rows.map((row) => {
                      if (!row.isAvailable) {
                        return (
                          <li
                            key={row.attemptId}
                            className="flex items-center gap-2"
                          >
                            <span className="font-medium text-foreground">
                              [Question no longer available]
                            </span>
                            <span className="text-muted-foreground">
                              {row.isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                          </li>
                        );
                      }

                      return (
                        <li key={row.attemptId}>
                          <Link
                            href={toQuestionRoute(row.slug, {
                              from: 'dashboard',
                            })}
                            className="flex items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          >
                            <span className="min-w-0 flex-1 font-medium text-foreground">
                              {getStemPreview(row.stemMd, 90)}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              {toSentenceCase(row.difficulty)}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {row.isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default async function DashboardPage() {
  const result = await getUserStats({});

  return renderDashboard(result);
}

export function renderDashboard(result: ActionResult<UserStatsOutput>) {
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">Unable to load stats.</p>
        </div>
        <ErrorCard className="p-6">{result.error.message}</ErrorCard>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
      </div>
    );
  }

  return <DashboardView stats={result.data} />;
}
