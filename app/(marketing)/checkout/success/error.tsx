'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function CheckoutSuccessError({
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
      title="Checkout error"
      description="We couldn't confirm your checkout right now. Please try again."
      links={[{ href: ROUTES.PRICING, label: 'Back to Pricing' }]}
      includeMainLandmark
      logPrefix="app/(marketing)/checkout/success/error.tsx:"
    />
  );
}
