'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { reportClientError } from '@/lib/report-client-error';
import { reloadCurrentPage } from '@/lib/stale-server-action';
import { supportMailtoHref } from '@/lib/support';
import { useReportCaughtError } from '@/lib/use-report-caught-error';
import { useStaleServerActionReload } from '@/lib/use-stale-server-action-reload';

export type ErrorBoundaryPageLink = {
  href: string;
  label: string;
};

export type ErrorBoundaryPageProps = {
  error: Error & { digest?: string };
  /** Next.js's retry: refetches the route from the server, then re-renders. */
  retry: () => void;
  title: string;
  description: string;
  links: ErrorBoundaryPageLink[];
  includeMainLandmark?: boolean;
  logPrefix?: string;
  reloadPage?: () => void;
  reportError?: typeof reportClientError;
};

export function ErrorBoundaryPage({
  error,
  retry,
  title,
  description,
  links,
  includeMainLandmark = false,
  logPrefix,
  reloadPage = reloadCurrentPage,
  reportError,
}: ErrorBoundaryPageProps) {
  useReportCaughtError(error, logPrefix ?? 'ErrorBoundaryPage:', reportError);
  useStaleServerActionReload(error, reloadPage);

  const content = (
    <div className="w-full max-w-md space-y-4 px-4 text-center">
      {includeMainLandmark ? (
        <h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">
          {title}
        </h1>
      ) : (
        <h2 className="text-xl font-semibold font-heading tracking-tight text-foreground">
          {title}
        </h2>
      )}
      <p className="text-sm text-muted-foreground">{description}</p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      ) : null}
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button type="button" onClick={retry}>
          Try again
        </Button>
        {links.map((link) => (
          <Button key={`${link.href}_${link.label}`} asChild variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
        <Button asChild variant="outline">
          <a href={supportMailtoHref({ page: title, errorId: error.digest })}>
            Contact support
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
