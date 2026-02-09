'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function PricingError({
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
      title="Pricing error"
      description="We couldn't load pricing right now. Please try again."
      links={[{ href: ROUTES.HOME, label: 'Back to Home' }]}
      includeMainLandmark
      logPrefix="app/pricing/error.tsx:"
    />
  );
}
