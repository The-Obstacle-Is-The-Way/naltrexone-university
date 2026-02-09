'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function ReviewError({
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
      title="Review error"
      description="We couldn't load your missed questions right now. Please try again."
      links={[{ href: ROUTES.APP_DASHBOARD, label: 'Back to Dashboard' }]}
      logPrefix="app/(app)/app/review/error.tsx:"
    />
  );
}
