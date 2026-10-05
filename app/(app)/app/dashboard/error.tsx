'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorBoundaryPage
      error={error}
      retry={retry}
      title="Dashboard error"
      description="We couldn't load your dashboard right now. Please try again."
      links={[{ href: ROUTES.APP_PRACTICE, label: 'Go to Practice' }]}
      includeMainLandmark
      logPrefix="app/(app)/app/dashboard/error.tsx:"
    />
  );
}
