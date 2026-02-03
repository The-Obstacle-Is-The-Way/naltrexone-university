'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

function MobileNavLinks({
  id,
  onClose,
}: {
  id?: string;
  onClose?: () => void;
}) {
  return (
    <nav
      id={id}
      aria-label="Mobile navigation"
      className="absolute left-0 right-0 top-full border-b border-border bg-background p-4"
    >
      <Link
        href="/app/dashboard"
        className="block rounded-md py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClose}
      >
        Dashboard
      </Link>
      <Link
        href="/app/practice"
        className="block rounded-md py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClose}
      >
        Practice
      </Link>
      <Link
        href="/app/review"
        className="block rounded-md py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClose}
      >
        Review
      </Link>
      <Link
        href="/app/bookmarks"
        className="block rounded-md py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClose}
      >
        Bookmarks
      </Link>
      <Link
        href="/app/billing"
        className="block rounded-md py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClose}
      >
        Billing
      </Link>
    </nav>
  );
}

export function MobileNav() {
  const navId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const onToggleOpen = () => setIsOpen((open) => !open);
  const onClose = () => setIsOpen(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        className="p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
        aria-controls={navId}
      >
        {isOpen ? (
          <X aria-hidden="true" className="size-6" />
        ) : (
          <Menu aria-hidden="true" className="size-6" />
        )}
      </button>

      {isOpen && <MobileNavLinks id={navId} onClose={onClose} />}
    </div>
  );
}
