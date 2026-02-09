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
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (notifiedRef.current) return;

    const toast = parseBookmarksToastCode(code);
    if (!toast) return;

    notifiedRef.current = true;

    notify({ message: 'Bookmark removed.', tone: 'success' });

    if (typeof window === 'undefined') return;

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
