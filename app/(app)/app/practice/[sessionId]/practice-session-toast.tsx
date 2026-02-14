'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/components/ui/notification-provider';

type PracticeSessionToastCode = 'session_started';

function parsePracticeSessionToastCode(
  code: string | undefined,
): PracticeSessionToastCode | null {
  if (code === 'session_started') return code;
  return null;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const truncated = Math.trunc(parsed);
  return truncated > 0 ? truncated : null;
}

export function PracticeSessionToast({
  code,
  requestedCount,
  actualCount,
}: {
  code: string | undefined;
  requestedCount?: string | undefined;
  actualCount?: string | undefined;
}) {
  const { notify } = useNotification();
  const lastHandledToastRef = useRef<string | null>(null);

  useEffect(() => {
    const toast = parsePracticeSessionToastCode(code);
    if (!toast) return;

    const requested = parsePositiveInt(requestedCount);
    const actual = parsePositiveInt(actualCount);
    const handledKey = `${toast}:${requested ?? ''}:${actual ?? ''}`;

    if (lastHandledToastRef.current === handledKey) return;
    lastHandledToastRef.current = handledKey;

    if (typeof requested === 'number' && typeof actual === 'number') {
      if (actual < requested) {
        notify({
          message: `Only ${actual} of ${requested} questions matched your filters. Starting session with ${actual} questions.`,
          tone: 'info',
        });
      } else {
        notify({ message: 'Session started.', tone: 'success' });
      }
    } else {
      notify({ message: 'Session started.', tone: 'success' });
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('toast');
    url.searchParams.delete('requestedCount');
    url.searchParams.delete('actualCount');
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [actualCount, code, notify, requestedCount]);

  return null;
}
