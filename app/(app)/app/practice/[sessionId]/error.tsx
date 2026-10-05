'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function PracticeSessionError({
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
      title="Practice session error"
      description="We couldn't load this practice session right now. Please try again."
      links={[{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }]}
      includeMainLandmark
      logPrefix="app/(app)/app/practice/[sessionId]/error.tsx:"
    />
  );
}
