'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import { APP_NAV_ITEMS } from '@/components/app-nav-items';

function MobileNavLinks({
  id,
  onClose,
  pathname,
  navRef,
}: {
  id?: string;
  onClose?: () => void;
  pathname: string | null;
  navRef: RefObject<HTMLElement | null>;
}) {
  const normalizedPathname = pathname?.split(/[?#]/)[0] ?? null;

  return (
    <nav
      id={id}
      aria-label="Mobile navigation"
      className="absolute left-0 right-0 top-full border-b border-border bg-background p-4"
      ref={navRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose?.();
          return;
        }

        if (event.key !== 'Tab') return;
        const container = event.currentTarget;
        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button, [tabindex]',
          ),
        ).filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'));

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last?.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      {APP_NAV_ITEMS.map((item) => {
        const isActive =
          normalizedPathname !== null &&
          (normalizedPathname === item.href ||
            normalizedPathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'block rounded-md bg-muted px-3 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                : 'block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            }
            onClick={onClose}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const navId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const onToggleOpen = () => setIsOpen((open) => !open);
  const onClose = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    const firstLink = navRef.current?.querySelector<HTMLElement>('a[href]');
    firstLink?.focus();
  }, [isOpen]);

  return (
    <div className="sm:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggleOpen}
        className="p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

      {isOpen && (
        <MobileNavLinks
          id={navId}
          onClose={onClose}
          pathname={pathname}
          navRef={navRef}
        />
      )}
    </div>
  );
}
