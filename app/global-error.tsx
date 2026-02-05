'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { REPORT_ISSUE_URL } from '@/lib/support';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('app/global-error.tsx:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-background text-foreground">
        <div className="flex min-h-[100dvh] items-center justify-center">
          <div className="w-full max-w-md space-y-4 px-4 text-center">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              Please try again. If the problem persists, contact support and
              share the error ID.
            </p>
            {error.digest ? (
              <p className="text-xs text-muted-foreground">
                Error ID: {error.digest}
              </p>
            ) : null}
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Button asChild variant="outline">
                <a href="/">Go home</a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={REPORT_ISSUE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Report issue
                </a>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
