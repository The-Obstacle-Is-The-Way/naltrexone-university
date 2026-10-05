'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function PricingError({
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
      title="Pricing error"
      description="We couldn't load pricing right now. Please try again."
      links={[{ href: ROUTES.HOME, label: 'Back to home' }]}
      includeMainLandmark
      logPrefix="app/pricing/error.tsx:"
    />
  );
}
