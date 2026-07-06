'use client';

import { useEffect, useRef, useState } from 'react';
import { MS_PER_SECOND } from '@/src/domain/services';

export type ExamTimerState = {
  remainingSeconds: number;
  isExpired: boolean;
};

export type UseExamTimerInput = {
  deadlineAt: string | null;
  isExamActive: boolean;
  onExpire: () => boolean | undefined | Promise<boolean | undefined>;
};

function computeRemainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / MS_PER_SECOND));
}

function computeState(deadlineMs: number | null): ExamTimerState | null {
  if (deadlineMs === null) return null;
  const remainingSeconds = computeRemainingSeconds(deadlineMs, Date.now());
  return {
    remainingSeconds,
    isExpired: remainingSeconds === 0,
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
      const nextState = computeState(deadlineMs);
      setState(nextState);
      if (
        !nextState?.isExpired ||
        deadlineMs === null ||
        firedDeadlineMsRef.current === deadlineMs
      ) {
        return;
      }

      firedDeadlineMsRef.current = deadlineMs;
      void Promise.resolve(onExpireRef.current())
        .then((handled) => {
          if (handled === false && firedDeadlineMsRef.current === deadlineMs) {
            firedDeadlineMsRef.current = null;
          }
        })
        .catch(() => {
          if (firedDeadlineMsRef.current === deadlineMs) {
            firedDeadlineMsRef.current = null;
          }
        });
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
