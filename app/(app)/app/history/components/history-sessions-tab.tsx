'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SessionBreakdownList } from '@/app/(app)/app/shared/components/session-breakdown-list';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from '@/components/ui/tab-switch-styles';
import { formatDate } from '@/lib/format-date';
import { formatDuration } from '@/lib/format-duration';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import { headerActionLinkClasses } from '@/lib/shared-styles';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';
import type { SessionModeFilter } from '../history-search-params';
import { buildHistorySessionsHref } from '../history-search-params';
import { useHistorySessions } from '../hooks/use-history-sessions';

export type HistorySessionsTabProps = {
  result: ActionResult<GetSessionHistoryOutput>;
  modeFilter?: SessionModeFilter;
};

type SessionSummaryContentProps = {
  mode: 'tutor' | 'exam';
  fractionLabel: string;
  accuracyLabel: string;
  durationLabel: string;
  endedOn: string;
};

function formatSessionAccuracy(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSessionMode(mode: 'tutor' | 'exam'): string {
  return mode === 'exam' ? 'Exam' : 'Tutor';
}

const MAX_DISPLAY_DURATION_MINUTES = 120;
const MAX_DISPLAY_DURATION_SECONDS = MAX_DISPLAY_DURATION_MINUTES * 60;

function formatSessionDurationDisplay(durationSeconds: number): string {
  if (durationSeconds > MAX_DISPLAY_DURATION_SECONDS) {
    return `>${MAX_DISPLAY_DURATION_MINUTES}m`;
  }
  return formatDuration(durationSeconds);
}

export function SessionSummaryContent({
  mode,
  fractionLabel,
  accuracyLabel,
  durationLabel,
  endedOn,
}: SessionSummaryContentProps) {
  return (
    <span data-session-summary-content="true">
      <span className="font-medium">{formatSessionMode(mode)}</span>
      <span className="mx-2">•</span>
      <span>
        {fractionLabel} correct ({accuracyLabel})
      </span>
      <span className="mx-2">•</span>
      <span>{durationLabel}</span>
      <span className="mx-2">•</span>
      <span>{endedOn}</span>
    </span>
  );
}

export function HistorySessionsTab({
  result,
  modeFilter = 'all',
}: HistorySessionsTabProps) {
  const historySessions = useHistorySessions();
  const router = useRouter();

  if (!result.ok) {
    return <ErrorCard className="p-4">{result.error.message}</ErrorCard>;
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
  const historyHref = buildHistorySessionsHref({
    limit,
    offset,
    mode: modeFilter,
  });
  const showingStart = rows.length > 0 ? offset + 1 : 0;
  const showingEnd = offset + rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {showingStart}–{showingEnd} of {total} sessions
        </div>
        <nav aria-label="Session mode filter">
          <div className={tabSwitchContainerClasses}>
            {[
              { value: 'all', label: 'All' },
              { value: 'tutor', label: 'Tutor' },
              { value: 'exam', label: 'Exam' },
            ].map((option) => (
              <Link
                key={option.value}
                href={buildHistorySessionsHref({
                  limit,
                  offset: 0,
                  mode: option.value as SessionModeFilter,
                })}
                aria-current={modeFilter === option.value ? 'page' : undefined}
                className={cn(
                  tabSwitchItemBaseClasses,
                  modeFilter === option.value
                    ? tabSwitchItemActiveClasses
                    : tabSwitchItemInactiveClasses,
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const isSelected =
            historySessions.selectedSessionId === row.sessionId;
          const endedOn = formatDate(row.endedAt);
          const fractionDenominator = row.questionCount;
          const fractionLabel = `${row.correct}/${fractionDenominator}`;
          const accuracyLabel = formatSessionAccuracy(row.accuracy);
          const durationLabel = formatSessionDurationDisplay(
            row.durationSeconds,
          );
          const sessionSummary = `${formatSessionMode(row.mode)} session: ${fractionLabel} correct (${accuracyLabel}), ${durationLabel}, ${endedOn}`;
          const selectedReview =
            historySessions.selectedReview?.sessionId === row.sessionId
              ? historySessions.selectedReview
              : null;
          const sessionReviewHref = row.firstQuestionSlug
            ? toQuestionRoute(row.firstQuestionSlug, {
                from: 'history',
                mode: 'review',
                sessionId: row.sessionId,
                historyHref,
              })
            : null;
          const isRowInteractive = sessionReviewHref !== null;

          return (
            /* biome-ignore lint/a11y/useKeyWithClickEvents: Row click is a pointer-only convenience; keyboard users navigate explicit Link and Button controls. */
            <li
              key={row.sessionId}
              className={cn(
                'rounded-xl bg-foreground/[0.08] p-3',
                isRowInteractive ? 'cursor-pointer' : undefined,
              )}
              onClick={(event) => {
                if (!sessionReviewHref) return;
                const target = event.target;
                if (!(target instanceof Element)) return;
                if (target.closest('[data-session-breakdown-region="true"]')) {
                  return;
                }
                const interactive = target.closest(
                  'a,button,input,select,textarea,[role="button"],[role="link"]',
                );
                if (interactive && interactive !== event.currentTarget) {
                  return;
                }
                router.push(sessionReviewHref);
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {sessionReviewHref ? (
                  <Link
                    href={sessionReviewHref}
                    className="rounded-md text-sm text-foreground ring-focus"
                  >
                    <SessionSummaryContent
                      mode={row.mode}
                      fractionLabel={fractionLabel}
                      accuracyLabel={accuracyLabel}
                      durationLabel={durationLabel}
                      endedOn={endedOn}
                    />
                  </Link>
                ) : (
                  <div className="text-sm text-foreground">
                    <SessionSummaryContent
                      mode={row.mode}
                      fractionLabel={fractionLabel}
                      accuracyLabel={accuracyLabel}
                      durationLabel={durationLabel}
                      endedOn={endedOn}
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-auto w-auto shrink-0 rounded-md p-1 hover:bg-transparent dark:hover:bg-transparent"
                  aria-label={`${isSelected ? 'Hide' : 'View'} breakdown for ${sessionSummary}`}
                  aria-expanded={isSelected}
                  aria-controls={`breakdown-${row.sessionId}`}
                  onClick={() => {
                    void historySessions.onOpenSession(row.sessionId);
                  }}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-4 text-foreground/60 transition-transform',
                      isSelected ? 'rotate-180' : undefined,
                    )}
                  />
                </Button>
              </div>

              {isSelected ? (
                /* biome-ignore lint/a11y/useSemanticElements: Spec requires explicit role wiring for disclosure region. */
                <div
                  id={`breakdown-${row.sessionId}`}
                  role="region"
                  aria-label="Question breakdown"
                  data-session-breakdown-region="true"
                  className="mt-3 border-t border-border/30 pt-3 dark:border-foreground/10"
                >
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
          <Button asChild variant="link" className={headerActionLinkClasses}>
            <Link
              href={buildHistorySessionsHref({
                limit,
                offset: prevOffset,
                mode: modeFilter,
              })}
            >
              Previous
            </Link>
          </Button>
        ) : (
          <span />
        )}

        {hasNextPage ? (
          <Button asChild variant="link" className={headerActionLinkClasses}>
            <Link
              href={buildHistorySessionsHref({
                limit,
                offset: nextOffset,
                mode: modeFilter,
              })}
            >
              Next
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
