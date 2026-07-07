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
      // Milestone announcements are only meaningful while the tab is visible.
      // A throttled background tick must neither announce nor advance the
      // baseline, or it consumes the crossing before the user can hear it;
      // the baseline stays frozen at the last visible value so the
      // return-to-visible update announces the lowest crossed milestone.
      const isDocumentHidden = document.visibilityState === 'hidden';
      const isSameDeadline = previousDeadlineMsRef.current === deadlineMs;
      const milestoneBaseline =
        !isDocumentHidden && isSameDeadline
          ? previousRemainingSecondsRef.current
          : null;
      const nextState = computeState(deadlineMs, milestoneBaseline);
      previousDeadlineMsRef.current = deadlineMs;
      if (!isDocumentHidden) {
        previousRemainingSecondsRef.current =
          nextState?.remainingSeconds ?? null;
      } else if (!isSameDeadline) {
        previousRemainingSecondsRef.current = null;
      }
      // Tab return fires visibilitychange and window focus back-to-back; the
      // second call sees no crossing because the first consumed the baseline.
      // Keep the announcement until the countdown actually advances so the
      // live region is not wiped before assistive tech announces it.
      setState((previous) => {
        if (
          nextState !== null &&
          previous !== null &&
          nextState.milestoneAnnouncement === null &&
          nextState.remainingSeconds === previous.remainingSeconds
        ) {
          return {
            ...nextState,
            milestoneAnnouncement: previous.milestoneAnnouncement,
          };
        }
        return nextState;
      });
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
