'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { REPORT_ISSUE_URL } from '@/lib/support';

export default function PracticeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('app/(app)/app/practice/error.tsx:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md space-y-4 px-4 text-center">
        <h2 className="text-xl font-semibold">Practice error</h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load practice right now. Please try again.
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
            <Link href={ROUTES.APP_DASHBOARD}>Back to Dashboard</Link>
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
  );
}
