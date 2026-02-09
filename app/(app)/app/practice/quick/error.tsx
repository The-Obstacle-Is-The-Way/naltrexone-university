'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function QuickPracticeError({
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
      title="Quick Practice error"
      description="We couldn't load quick practice right now. Please try again."
      links={[{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }]}
      includeMainLandmark
      logPrefix="app/(app)/app/practice/quick/error.tsx:"
    />
  );
}
