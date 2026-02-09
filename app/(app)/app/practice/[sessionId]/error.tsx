'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function PracticeSessionError({
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
      title="Practice session error"
      description="We couldn't load this practice session right now. Please try again."
      links={[{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }]}
      logPrefix="app/(app)/app/practice/[sessionId]/error.tsx:"
    />
  );
}
