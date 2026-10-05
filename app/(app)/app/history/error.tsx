'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function HistoryError({
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
      title="History error"
      description="We couldn't load your history right now. Please try again."
      links={[{ href: ROUTES.APP_DASHBOARD, label: 'Back to Dashboard' }]}
      includeMainLandmark
      logPrefix="app/(app)/app/history/error.tsx:"
    />
  );
}
