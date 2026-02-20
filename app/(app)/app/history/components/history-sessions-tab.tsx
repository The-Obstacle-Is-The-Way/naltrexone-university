'use client';

import Link from 'next/link';
import { SessionBreakdownList } from '@/app/(app)/app/shared/components/session-breakdown-list';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format-date';
import { formatDuration } from '@/lib/format-duration';
import { ROUTES } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';
import { buildHistorySessionsHref } from '../history-search-params';
import { useHistorySessions } from '../hooks/use-history-sessions';

const headerLinkButtonClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';

export type HistorySessionsTabProps = {
  result: ActionResult<GetSessionHistoryOutput>;
};

function formatSessionAccuracy(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSessionMode(mode: 'tutor' | 'exam'): string {
  return mode === 'exam' ? 'Exam' : 'Tutor';
}

export function HistorySessionsTab({ result }: HistorySessionsTabProps) {
  const historySessions = useHistorySessions();

  if (!result.ok) {
    return <ErrorCard>{result.error.message}</ErrorCard>;
  }

  const rows = result.data.rows;
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        <div>No completed sessions yet.</div>
        <div className="mt-3">
          <Button asChild variant="outline" className="rounded-full">
            <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { limit, offset, total } = result.data;
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasNextPage = offset + rows.length < total;
  const historyHref = buildHistorySessionsHref({ limit, offset });

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {rows.map((row) => {
          const isSelected =
            historySessions.selectedSessionId === row.sessionId;
          const endedOn = formatDate(row.endedAt);
          const fractionDenominator =
            row.mode === 'exam' ? row.questionCount : row.answered;
          const fractionLabel = `${row.correct}/${fractionDenominator}`;
          const accuracyLabel =
            row.mode === 'exam' || row.answered > 0
              ? formatSessionAccuracy(row.accuracy)
              : '—';
          const sessionSummary = `${formatSessionMode(row.mode)} session: ${fractionLabel} correct (${accuracyLabel}), ${formatDuration(row.durationSeconds)}, ${endedOn}`;
          const selectedReview =
            historySessions.selectedReview?.sessionId === row.sessionId
              ? historySessions.selectedReview
              : null;

          return (
            <li
              key={row.sessionId}
              className="rounded-xl border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-foreground">
                  <span className="font-medium">
                    {formatSessionMode(row.mode)}
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    {fractionLabel} correct ({accuracyLabel})
                  </span>
                  <span className="mx-2">•</span>
                  <span>{formatDuration(row.durationSeconds)}</span>
                  <span className="mx-2">•</span>
                  <span>{endedOn}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  aria-label={`${isSelected ? 'Hide' : 'View'} breakdown for ${sessionSummary}`}
                  onClick={() => {
                    void historySessions.onOpenSession(row.sessionId);
                  }}
                >
                  {isSelected ? 'Hide breakdown' : 'View breakdown'}
                </Button>
              </div>

              {isSelected ? (
                <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                  {historySessions.reviewLoadState.status === 'loading' ? (
                    <output
                      className="text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      Loading question breakdown…
                    </output>
                  ) : null}
                  {historySessions.reviewLoadState.status === 'error' ? (
                    <div className="text-sm text-destructive" role="alert">
                      {historySessions.reviewLoadState.message}
                    </div>
                  ) : null}
                  {selectedReview ? (
                    <SessionBreakdownList
                      rows={selectedReview.rows}
                      from="history"
                      sessionId={row.sessionId}
                      historyHref={historyHref}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between">
        {offset > 0 ? (
          <Button asChild variant="link" className={headerLinkButtonClasses}>
            <Link
              href={buildHistorySessionsHref({ limit, offset: prevOffset })}
            >
              Previous
            </Link>
          </Button>
        ) : (
          <span />
        )}

        {hasNextPage ? (
          <Button asChild variant="link" className={headerLinkButtonClasses}>
            <Link
              href={buildHistorySessionsHref({ limit, offset: nextOffset })}
            >
              Next
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
