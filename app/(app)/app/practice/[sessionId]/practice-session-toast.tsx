'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/components/ui/notification-provider';
import { pluralize } from '@/lib/pluralize';

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
    if (
      typeof requested !== 'number' ||
      typeof actual !== 'number' ||
      actual >= requested
    ) {
      return;
    }

    const handledKey = `${toast}:${requested ?? ''}:${actual ?? ''}`;

    if (lastHandledToastRef.current === handledKey) return;
    lastHandledToastRef.current = handledKey;

    notify({
      message: `Only ${actual} of ${pluralize(requested, 'question')} matched your filters. Starting session with ${pluralize(actual, 'question')}.`,
      tone: 'info',
    });

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
