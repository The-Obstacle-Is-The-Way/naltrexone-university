'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function DashboardError({
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
      title="Dashboard error"
      description="We couldn't load your dashboard right now. Please try again."
      links={[{ href: ROUTES.APP_PRACTICE, label: 'Go to Practice' }]}
      logPrefix="app/(app)/app/dashboard/error.tsx:"
    />
  );
}
