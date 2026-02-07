import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type {
  GetPracticeSessionReviewOutput,
  GetSessionHistoryOutput,
} from '@/src/adapters/controllers/practice-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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
            No completed sessions yet.
          </div>
        ) : null}
        {props.status === 'idle' && props.rows.length > 0 ? (
          <ul className="space-y-2">
            {props.rows.map((row) => (
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
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => props.onOpenSession(row.sessionId)}
                  >
                    {props.selectedSessionId === row.sessionId
                      ? 'Refresh breakdown'
                      : 'View breakdown'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {props.selectedSessionId ? (
        <div className="mt-4 space-y-3">
          <div className="text-sm font-medium text-foreground">
            Session breakdown
          </div>
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
            <ul className="space-y-2">
              {props.selectedReview.rows.map((row) => (
                <li
                  key={row.questionId}
                  className="text-sm text-muted-foreground flex items-center gap-2"
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
      ) : null}
    </Card>
  );
}
