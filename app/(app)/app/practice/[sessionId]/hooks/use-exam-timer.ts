'use client';

import { useEffect, useRef, useState } from 'react';
import type { PracticeSessionTimingSnapshot } from '@/src/application/shared/practice-session-timing';
import { MS_PER_SECOND } from '@/src/domain/services';

export type ExamTimerState = {
  remainingSeconds: number;
  isExpired: boolean;
  milestoneAnnouncement: string | null;
};

export type UseExamTimerInput = {
  deadlineAt: string | null;
  remainingMs: number | null;
  readTiming: () => Promise<PracticeSessionTimingSnapshot | null>;
  isExamActive: boolean;
  onExpire: () => boolean | undefined | Promise<boolean | undefined>;
};

const EXAM_TIMER_MILESTONES = [
  { seconds: 300, announcement: '5 minutes remaining' },
  { seconds: 60, announcement: '1 minute remaining' },
  { seconds: 30, announcement: '30 seconds remaining' },
] as const;

// After the server refuses an early finalization and no fresh timing sample
// arrives, the next attempt waits this long rather than one tick.
const REFUSED_EXPIRY_RETRY_MS = 5_000;

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
  remainingMs: number | null,
  previousRemainingSeconds: number | null = null,
): ExamTimerState | null {
  if (remainingMs === null) return null;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND));
  return {
    remainingSeconds,
    isExpired: remainingSeconds === 0,
    milestoneAnnouncement: getCrossedMilestoneAnnouncement(
      previousRemainingSeconds,
      remainingSeconds,
    ),
  };
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
  const readTimingRef = useRef(input.readTiming);
  const previousDeadlineRef = useRef<string | null>(null);
  const firedDeadlineRef = useRef<string | null>(null);
  const previousRemainingSecondsRef = useRef<number | null>(null);
  const deadlineAt = input.isExamActive ? input.deadlineAt : null;
  const remainingMs = input.remainingMs;
  const [state, setState] = useState<ExamTimerState | null>(() =>
    computeState(deadlineAt === null ? null : remainingMs),
  );

  useEffect(() => {
    onExpireRef.current = input.onExpire;
    readTimingRef.current = input.readTiming;
  }, [input.onExpire, input.readTiming]);

  useEffect(() => {
    if (deadlineAt === null || remainingMs === null) return;
    let active = true;
    let expiresAt = performance.now() + remainingMs;
    let reading: Promise<boolean> | null = null;
    let retryTimeoutId: number | undefined;

    function releaseExpiry() {
      if (firedDeadlineRef.current === deadlineAt)
        firedDeadlineRef.current = null;
    }

    function update(allowExpiry = true) {
      if (!active) return;
      const isDocumentHidden = document.visibilityState === 'hidden';
      const isSameDeadline = previousDeadlineRef.current === deadlineAt;
      const previousBaseline = previousRemainingSecondsRef.current;
      const nextState = computeState(
        Math.max(0, expiresAt - performance.now()),
        deriveMilestoneBaseline({
          isDocumentHidden,
          isSameDeadline,
          previousBaseline,
        }),
      );
      previousDeadlineRef.current = deadlineAt;
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
        !allowExpiry ||
        !nextState?.isExpired ||
        firedDeadlineRef.current === deadlineAt
      )
        return;
      firedDeadlineRef.current = deadlineAt;
      void (async () => {
        try {
          const handled = await onExpireRef.current();
          if (handled !== false || firedDeadlineRef.current !== deadlineAt)
            return;
          // The server's deadline has not passed. A newer sample already
          // restarted this countdown if the effect is no longer active.
          if (!active || (await resync())) {
            releaseExpiry();
            return;
          }
          // No fresh sample: a pause, not a mutation each tick.
          if (active)
            retryTimeoutId = window.setTimeout(
              releaseExpiry,
              REFUSED_EXPIRY_RETRY_MS,
            );
        } catch {
          // onExpire reports its own failures; retry on the next tick.
          releaseExpiry();
        }
      })();
    }

    /** True when a server sample for this deadline moved the countdown. */
    function resync(): Promise<boolean> {
      if (reading) return reading;
      reading = (async () => {
        try {
          const timing = await readTimingRef.current();
          if (
            !active ||
            timing?.deadlineAt !== deadlineAt ||
            timing.remainingMs === null
          )
            return false;
          expiresAt = performance.now() + timing.remainingMs;
          return true;
        } catch {
          // A failed refresh keeps the last server sample; finalization still
          // checks the server cutoff and the next focus can refresh again.
          return false;
        } finally {
          reading = null;
          if (active) update(false);
        }
      })();
      return reading;
    }

    function onReturn() {
      if (document.visibilityState !== 'hidden')
        void resync().then(() => update());
    }

    // Refresh on activation too: a return from the review stage may have an
    // older question payload, and performance.now can pause during sleep.
    void resync().then(() => update());
    update();
    const intervalId = window.setInterval(() => update(), MS_PER_SECOND);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.clearTimeout(retryTimeoutId);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [deadlineAt, remainingMs]);

  return deadlineAt === null ? null : state;
}
