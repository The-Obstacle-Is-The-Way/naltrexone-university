import { cn } from '@/lib/utils';

export const EXAM_TIMER_WARNING_SECONDS = 60;

export type ExamTimerProps = {
  remainingSeconds: number;
  isExpired: boolean;
  milestoneAnnouncement: string | null;
};

function formatRemainingSeconds(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ExamTimer(props: ExamTimerProps) {
  const isWarning =
    props.remainingSeconds <= EXAM_TIMER_WARNING_SECONDS || props.isExpired;

  return (
    <div
      role="timer"
      aria-label="Exam time remaining"
      className={cn(
        'inline-flex min-w-24 items-center justify-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium tabular-nums',
        isWarning
          ? 'border-destructive/40 text-destructive'
          : 'text-foreground',
      )}
    >
      <span className="text-muted-foreground text-xs font-normal">
        Time left
      </span>
      <span aria-hidden="true">
        {formatRemainingSeconds(props.remainingSeconds)}
      </span>
      <span className="sr-only">
        {formatRemainingSeconds(props.remainingSeconds)}
      </span>
      <span className="sr-only" aria-live="polite">
        {props.milestoneAnnouncement ?? ''}
      </span>
      <span className="sr-only" aria-live="assertive">
        {props.isExpired ? 'Time is up. Submitting your exam.' : ''}
      </span>
    </div>
  );
}
