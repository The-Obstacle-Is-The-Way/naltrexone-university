import { cn } from '@/lib/utils';

export const EXAM_TIMER_WARNING_SECONDS = 60;
export const EXAM_TIMER_MILESTONE_SECONDS = {
  fiveMinutes: 300,
  oneMinute: 60,
  thirtySeconds: 30,
} as const;

export type ExamTimerProps = {
  remainingSeconds: number;
  isExpired: boolean;
};

function formatRemainingSeconds(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getMilestoneAnnouncement(remainingSeconds: number): string | null {
  if (remainingSeconds === EXAM_TIMER_MILESTONE_SECONDS.fiveMinutes) {
    return '5 minutes remaining';
  }
  if (remainingSeconds === EXAM_TIMER_MILESTONE_SECONDS.oneMinute) {
    return '1 minute remaining';
  }
  if (remainingSeconds === EXAM_TIMER_MILESTONE_SECONDS.thirtySeconds) {
    return '30 seconds remaining';
  }
  return null;
}

export function ExamTimer(props: ExamTimerProps) {
  const isWarning =
    props.remainingSeconds <= EXAM_TIMER_WARNING_SECONDS || props.isExpired;
  const milestoneAnnouncement = getMilestoneAnnouncement(
    props.remainingSeconds,
  );

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
        {milestoneAnnouncement ?? ''}
      </span>
      <span className="sr-only" aria-live="assertive">
        {props.isExpired ? 'Time is up. Submitting your exam.' : ''}
      </span>
    </div>
  );
}
