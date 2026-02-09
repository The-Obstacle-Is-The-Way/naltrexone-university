'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function QuestionError({
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
      title="Question error"
      description="We couldn't load this question right now. Please try again."
      links={[
        { href: ROUTES.APP_REVIEW, label: 'Back to Review' },
        { href: ROUTES.APP_PRACTICE, label: 'Go to Practice' },
      ]}
      includeMainLandmark
      logPrefix="app/(app)/app/questions/[slug]/error.tsx:"
    />
  );
}
