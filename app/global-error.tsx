'use client';

import { useEffect } from 'react';

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
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
