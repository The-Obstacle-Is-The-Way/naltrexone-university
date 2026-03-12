'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

const INTERACTIVE_DESCENDANT_SELECTOR =
  'a,button,input,select,textarea,[role="button"],[role="link"]';

type BookmarkRowShellProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function BookmarkRowShell({
  href,
  className,
  children,
}: BookmarkRowShellProps) {
  const router = useRouter();

  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: Row click is a pointer-only convenience; keyboard users navigate explicit Link and Button controls. */
    /* biome-ignore lint/a11y/useKeyWithClickEvents: Row click is a pointer-only convenience; keyboard users navigate explicit Link and Button controls. */
    <div
      className={className}
      onClick={(event) => {
        const target = event.target;

        if (target instanceof Element) {
          const interactive = target.closest(INTERACTIVE_DESCENDANT_SELECTOR);
          if (interactive && interactive !== event.currentTarget) {
            return;
          }
        }

        router.push(href);
      }}
    >
      {children}
    </div>
  );
}
