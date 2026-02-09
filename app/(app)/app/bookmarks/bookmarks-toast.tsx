'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/components/ui/notification-provider';

type BookmarksToastCode = 'bookmark_removed';

function parseBookmarksToastCode(
  code: string | undefined,
): BookmarksToastCode | null {
  if (code === 'bookmark_removed') return code;
  return null;
}

export function BookmarksToast({ code }: { code: string | undefined }) {
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
