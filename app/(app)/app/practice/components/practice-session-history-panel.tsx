import { SessionBreakdownList } from '@/app/(app)/app/shared/components/session-breakdown-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { formatDuration } from '@/lib/format-duration';
import type {
  GetPracticeSessionReviewOutput,
  GetSessionHistoryOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { LoadState } from '../practice-page-logic';

export type PracticeSessionHistoryPanelProps = {
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  rows: GetSessionHistoryOutput['rows'];
  selectedSessionId: string | null;
  selectedReview: GetPracticeSessionReviewOutput | null;
  reviewStatus: LoadState;
  onOpenSession: (sessionId: string) => void;
};

function formatSessionAccuracy(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSessionMode(mode: 'tutor' | 'exam'): string {
  return mode === 'exam' ? 'Exam' : 'Tutor';
}

export function PracticeSessionHistoryPanel(
  props: PracticeSessionHistoryPanelProps,
) {
  return (
    <Card className="gap-0 rounded-2xl p-6 shadow-sm">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          Recent sessions
        </div>
        <div className="text-sm text-muted-foreground">
          Review recent completed sessions and open question breakdown.
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {props.status === 'loading' ? (
          <output className="text-sm text-muted-foreground" aria-live="polite">
            Loading sessions…
          </output>
        ) : null}
        {props.status === 'error' && props.error ? (
          <div className="text-sm text-destructive" role="alert">
            {props.error}
          </div>
        ) : null}
        {props.status === 'idle' && props.rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            <div>No completed sessions yet.</div>
            <div className="mt-3">
              <Button asChild variant="outline" className="rounded-full">
                <a href="#practice-session-starter">Start a session</a>
              </Button>
            </div>
          </div>
        ) : null}
        {props.status === 'idle' && props.rows.length > 0 ? (
          <ul className="space-y-2">
            {props.rows.map((row) => {
              const isSelected = props.selectedSessionId === row.sessionId;
              const actionLabel = isSelected ? 'Hide' : 'View';
              const endedOn = formatDate(row.endedAt);
              const sessionSummary = `${formatSessionMode(row.mode)} session: ${row.correct}/${row.questionCount} correct (${formatSessionAccuracy(row.accuracy)}), ${formatDuration(row.durationSeconds)}, ${endedOn}`;

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
                        {row.correct}/{row.questionCount} correct (
                        {formatSessionAccuracy(row.accuracy)})
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
                      aria-label={`${actionLabel} breakdown for ${sessionSummary}`}
                      onClick={() => props.onOpenSession(row.sessionId)}
                    >
                      {isSelected ? 'Hide breakdown' : 'View breakdown'}
                    </Button>
                  </div>

                  {isSelected ? (
                    <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                      {props.reviewStatus.status === 'loading' ? (
                        <output
                          className="text-sm text-muted-foreground"
                          aria-live="polite"
                        >
                          Loading question breakdown…
                        </output>
                      ) : null}
                      {props.reviewStatus.status === 'error' ? (
                        <div className="text-sm text-destructive" role="alert">
                          {props.reviewStatus.message}
                        </div>
                      ) : null}
                      {props.selectedReview ? (
                        <SessionBreakdownList
                          rows={props.selectedReview.rows}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
