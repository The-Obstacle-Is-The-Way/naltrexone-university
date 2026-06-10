'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ROUTES } from '@/lib/routes';

export const CHECKOUT_SUCCESS_REDIRECT_DELAY_MS = 3_500;

/**
 * Controlled post-confirmation navigation for the checkout-success
 * interstitial. Entitlement is already persisted server-side before this
 * mounts, so navigating to the dashboard is safe. Uses replace semantics so
 * the back button does not loop through the interstitial, and clears the
 * timer on unmount so manual navigation wins. The visible "Go to your
 * dashboard" link on the page is the no-JS / timer-failure escape hatch.
 */
export function CheckoutSuccessRedirect(): null {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(ROUTES.APP_DASHBOARD);
    }, CHECKOUT_SUCCESS_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [router]);

  return null;
}
