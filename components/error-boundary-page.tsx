'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { REPORT_ISSUE_URL } from '@/lib/support';

export type ErrorBoundaryPageLink = {
  href: string;
  label: string;
};

export type ErrorBoundaryPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  links: ErrorBoundaryPageLink[];
  includeMainLandmark?: boolean;
  logPrefix?: string;
};

export function ErrorBoundaryPage({
  error,
  reset,
  title,
  description,
  links,
  includeMainLandmark = false,
  logPrefix,
}: ErrorBoundaryPageProps) {
  useEffect(() => {
    console.error(logPrefix ?? 'ErrorBoundaryPage:', error);
  }, [error, logPrefix]);

  const content = (
    <div className="w-full max-w-md space-y-4 px-4 text-center">
      <h2 className="text-xl font-semibold font-heading text-foreground">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      ) : null}
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        {links.map((link) => (
          <Button key={`${link.href}_${link.label}`} asChild variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
        <Button asChild variant="outline">
          <a href={REPORT_ISSUE_URL} target="_blank" rel="noreferrer noopener">
            Report issue
          </a>
        </Button>
      </div>
    </div>
  );

  const containerClassName =
    'flex min-h-[50vh] items-center justify-center bg-background text-foreground';

  if (includeMainLandmark) {
    return (
      <main id="main-content" tabIndex={-1} className={containerClassName}>
        {content}
      </main>
    );
  }

  return <div className={containerClassName}>{content}</div>;
}
