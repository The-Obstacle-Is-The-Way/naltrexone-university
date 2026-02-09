'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Something went wrong"
      description="Please try again. If the problem persists, contact support and share the error ID."
      links={[{ href: ROUTES.HOME, label: 'Go home' }]}
      includeMainLandmark
      logPrefix="app/error.tsx:"
    />
  );
}
