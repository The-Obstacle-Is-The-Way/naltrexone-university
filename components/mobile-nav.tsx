'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

function MobileNavLinks({ onClose }: { onClose?: () => void }) {
  return (
    <nav className="absolute left-0 right-0 top-full border-b border-border bg-background p-4">
      <Link
        href="/app/dashboard"
        className="block py-3 text-sm text-muted-foreground hover:text-foreground"
        onClick={onClose}
      >
        Dashboard
      </Link>
      <Link
        href="/app/practice"
        className="block py-3 text-sm text-muted-foreground hover:text-foreground"
        onClick={onClose}
      >
        Practice
      </Link>
      <Link
        href="/app/review"
        className="block py-3 text-sm text-muted-foreground hover:text-foreground"
        onClick={onClose}
      >
        Review
      </Link>
      <Link
        href="/app/billing"
        className="block py-3 text-sm text-muted-foreground hover:text-foreground"
        onClick={onClose}
      >
        Billing
      </Link>
    </nav>
  );
}

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground"
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>

      {isOpen && <MobileNavLinks onClose={() => setIsOpen(false)} />}
    </div>
  );
}

/** Test-only: Renders MobileNav in expanded state for static render testing */
export function MobileNavOpen() {
  return (
    <div className="sm:hidden">
      <button
        type="button"
        className="p-2 text-muted-foreground hover:text-foreground"
        aria-label="Close navigation menu"
        aria-expanded={true}
      >
        <X className="size-6" />
      </button>
      <MobileNavLinks />
    </div>
  );
}
