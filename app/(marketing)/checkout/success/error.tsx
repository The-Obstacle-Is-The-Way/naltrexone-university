'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { REPORT_ISSUE_URL } from '@/lib/support';

export default function CheckoutSuccessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('app/(marketing)/checkout/success/error.tsx:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md space-y-4 px-4 text-center">
        <h2 className="text-xl font-semibold">Checkout error</h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t confirm your checkout right now. Please try again.
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
            <Link href={ROUTES.PRICING}>Back to Pricing</Link>
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
