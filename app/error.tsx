'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('app/error.tsx:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md space-y-4 px-4 text-center">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          Please try again. If the problem persists, contact support and share
          the error ID.
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
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
