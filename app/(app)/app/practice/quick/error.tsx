'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function QuickPracticeError({
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
      title="Quick Practice error"
      description="We couldn't load quick practice right now. Please try again."
      links={[{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }]}
      includeMainLandmark
      logPrefix="app/(app)/app/practice/quick/error.tsx:"
    />
  );
}
