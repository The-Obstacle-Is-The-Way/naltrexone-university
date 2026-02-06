import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  getUserStats,
  type UserStatsOutput,
} from '@/src/adapters/controllers/stats-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function DashboardView({ stats }: { stats: UserStatsOutput }) {
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
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-border/80 hover:bg-muted/50 transition-all">
          <div className="text-sm text-muted-foreground">Total answered</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {stats.totalAnswered}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-border/80 hover:bg-muted/50 transition-all">
          <div className="text-sm text-muted-foreground">Overall accuracy</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatPercent(stats.accuracyOverall)}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-border/80 hover:bg-muted/50 transition-all">
          <div className="text-sm text-muted-foreground">Answered (7 days)</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {stats.answeredLast7Days}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-border/80 hover:bg-muted/50 transition-all">
          <div className="text-sm text-muted-foreground">Accuracy (7 days)</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {formatPercent(stats.accuracyLast7Days)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-border/80 hover:bg-muted/50 transition-all">
          <div className="text-sm text-muted-foreground">Current streak</div>
          <div className="mt-2 text-3xl font-bold font-display text-foreground">
            {stats.currentStreakDays}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Consecutive days with at least one answer.
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm">
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
              <Link href="/app/practice">Go to Practice</Link>
            </Button>
          </div>
        </div>
      </div>

      {stats.recentActivity.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-foreground">
            Recent activity
          </div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {stats.recentActivity.map((row) => (
              <li key={row.attemptId} className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {row.isAvailable
                    ? getStemPreview(row.stemMd, 100)
                    : '[Question no longer available]'}
                </span>
                <span className="text-muted-foreground">
                  {row.isCorrect ? 'Correct' : 'Incorrect'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
        <div
          className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm"
          role="alert"
        >
          {result.error.message}
        </div>
        <Button asChild className="rounded-full">
          <Link href="/app/practice">Go to Practice</Link>
        </Button>
      </div>
    );
  }

  return <DashboardView stats={result.data} />;
}
