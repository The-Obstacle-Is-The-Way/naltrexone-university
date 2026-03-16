'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/components/ui/notification-provider';
import { normalizeSearchParam } from '@/lib/search-params';

type BookmarksToastCode = 'bookmark_removed';

function parseBookmarksToastCode(
  code: string | string[] | undefined,
): BookmarksToastCode | null {
  const normalized = normalizeSearchParam(code);
  if (normalized === 'bookmark_removed') return normalized;
  return null;
}

export function BookmarksToast({
  code,
}: {
  code: string | string[] | undefined;
}) {
  const { notify } = useNotification();
  const lastHandledToastRef = useRef<BookmarksToastCode | null>(null);

  useEffect(() => {
    const toast = parseBookmarksToastCode(code);
    if (!toast) return;

    if (lastHandledToastRef.current === toast) return;
    lastHandledToastRef.current = toast;

    notify({ message: 'Bookmark removed.', tone: 'success' });

    const url = new URL(window.location.href);
    url.searchParams.delete('toast');
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [code, notify]);

  return null;
}
