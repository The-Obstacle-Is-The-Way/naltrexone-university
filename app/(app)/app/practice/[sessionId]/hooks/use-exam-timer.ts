'use client';

import { useEffect, useRef, useState } from 'react';
import { MS_PER_SECOND } from '@/src/domain/services';

export type ExamTimerState = {
  remainingSeconds: number;
  isExpired: boolean;
  milestoneAnnouncement: string | null;
};

export type UseExamTimerInput = {
  deadlineAt: string | null;
  isExamActive: boolean;
  onExpire: () => boolean | undefined | Promise<boolean | undefined>;
};

function computeRemainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / MS_PER_SECOND));
}

const EXAM_TIMER_MILESTONES = [
  { seconds: 300, announcement: '5 minutes remaining' },
  { seconds: 60, announcement: '1 minute remaining' },
  { seconds: 30, announcement: '30 seconds remaining' },
] as const;

function getCrossedMilestoneAnnouncement(
  previousRemainingSeconds: number | null,
  remainingSeconds: number,
): string | null {
  if (previousRemainingSeconds === null || remainingSeconds === 0) {
    return null;
  }

  let crossedMilestone: (typeof EXAM_TIMER_MILESTONES)[number] | null = null;
  for (const milestone of EXAM_TIMER_MILESTONES) {
    if (
      previousRemainingSeconds > milestone.seconds &&
      milestone.seconds >= remainingSeconds
    ) {
      if (
        crossedMilestone === null ||
        milestone.seconds < crossedMilestone.seconds
      ) {
        crossedMilestone = milestone;
      }
    }
  }

  return crossedMilestone?.announcement ?? null;
}

function computeState(
  deadlineMs: number | null,
  previousRemainingSeconds: number | null = null,
): ExamTimerState | null {
  if (deadlineMs === null) return null;
  const remainingSeconds = computeRemainingSeconds(deadlineMs, Date.now());
  return {
    remainingSeconds,
    isExpired: remainingSeconds === 0,
    milestoneAnnouncement: getCrossedMilestoneAnnouncement(
      previousRemainingSeconds,
      remainingSeconds,
    ),
  };
}

function parseDeadline(deadlineAt: string | null): number | null {
  if (deadlineAt === null) return null;
  const deadlineMs = Date.parse(deadlineAt);
  return Number.isFinite(deadlineMs) ? deadlineMs : null;
}

/**
 * Milestone announcements are only meaningful while the tab is visible. A
 * throttled background tick must neither announce nor advance the baseline,
 * or it consumes the crossing before the user can hear it; the baseline
 * stays frozen at the last visible value so the return-to-visible update
 * announces the lowest crossed milestone. A deadline change always discards
 * the old baseline — it belongs to a different countdown.
 */
export function deriveMilestoneBaseline(input: {
  isDocumentHidden: boolean;
  isSameDeadline: boolean;
  previousBaseline: number | null;
}): number | null {
  return !input.isDocumentHidden && input.isSameDeadline
    ? input.previousBaseline
    : null;
}

export function deriveNextMilestoneBaseline(input: {
  isDocumentHidden: boolean;
  isSameDeadline: boolean;
  previousBaseline: number | null;
  nextRemainingSeconds: number | null;
}): number | null {
  if (!input.isDocumentHidden) return input.nextRemainingSeconds;
  return input.isSameDeadline ? input.previousBaseline : null;
}

/**
 * Tab return fires visibilitychange and window focus back-to-back; the second
 * call sees no crossing because the first consumed the baseline. Keep the
 * announcement while the countdown has not advanced so the live region is not
 * wiped before assistive tech announces it — but never across a deadline
 * change, whose countdown it never belonged to.
 */
export function mergeMilestoneAnnouncement(input: {
  previous: ExamTimerState | null;
  next: ExamTimerState | null;
  isSameDeadline: boolean;
}): ExamTimerState | null {
  if (
    input.next !== null &&
    input.previous !== null &&
    input.isSameDeadline &&
    input.next.milestoneAnnouncement === null &&
    input.next.remainingSeconds === input.previous.remainingSeconds
  ) {
    return {
      ...input.next,
      milestoneAnnouncement: input.previous.milestoneAnnouncement,
    };
  }
  return input.next;
}

export function useExamTimer(input: UseExamTimerInput): ExamTimerState | null {
  const onExpireRef = useRef(input.onExpire);
  const firedDeadlineMsRef = useRef<number | null>(null);
  const previousDeadlineMsRef = useRef<number | null>(null);
  const previousRemainingSecondsRef = useRef<number | null>(null);
  const deadlineMs =
    input.isExamActive && input.deadlineAt !== null
      ? parseDeadline(input.deadlineAt)
      : null;
  const [state, setState] = useState<ExamTimerState | null>(() =>
    computeState(deadlineMs),
  );

  useEffect(() => {
    onExpireRef.current = input.onExpire;
  }, [input.onExpire]);

  useEffect(() => {
    function update() {
      const isDocumentHidden = document.visibilityState === 'hidden';
      const isSameDeadline = previousDeadlineMsRef.current === deadlineMs;
      const previousBaseline = previousRemainingSecondsRef.current;
      const nextState = computeState(
        deadlineMs,
        deriveMilestoneBaseline({
          isDocumentHidden,
          isSameDeadline,
          previousBaseline,
        }),
      );
      previousDeadlineMsRef.current = deadlineMs;
      previousRemainingSecondsRef.current = deriveNextMilestoneBaseline({
        isDocumentHidden,
        isSameDeadline,
        previousBaseline,
        nextRemainingSeconds: nextState?.remainingSeconds ?? null,
      });
      setState((previous) =>
        mergeMilestoneAnnouncement({
          previous,
          next: nextState,
          isSameDeadline,
        }),
      );
      if (
        !nextState?.isExpired ||
        deadlineMs === null ||
        firedDeadlineMsRef.current === deadlineMs
      ) {
        return;
      }

      firedDeadlineMsRef.current = deadlineMs;
      void (async () => {
        try {
          const handled = await onExpireRef.current();
          if (handled === false && firedDeadlineMsRef.current === deadlineMs) {
            firedDeadlineMsRef.current = null;
          }
        } catch {
          // onExpire reports its own failures; clear the latch so the next tick
          // can retry expiry finalization for the same deadline.
          if (firedDeadlineMsRef.current === deadlineMs) {
            firedDeadlineMsRef.current = null;
          }
        }
      })();
    }

    update();

    if (deadlineMs === null) return;

    const intervalId = window.setInterval(update, MS_PER_SECOND);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [deadlineMs]);

  return deadlineMs === null ? null : state;
}
