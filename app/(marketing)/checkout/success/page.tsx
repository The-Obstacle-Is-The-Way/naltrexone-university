import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { normalizeSearchParam } from '@/lib/search-params';
import { CheckoutSuccessRedirect } from './checkout-success-redirect';
import {
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
  syncCheckoutSuccess,
} from './checkout-success-sync';
import type { CheckoutSuccessSearchParams } from './checkout-success-types';

export const metadata: Metadata = {
  title: 'Checkout Success - Addiction Boards',
};

export const maxDuration = 30;

export {
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
  syncCheckoutSuccess,
};

export type CheckoutSuccessPageProps = {
  searchParams: Promise<CheckoutSuccessSearchParams>;
};

export async function runCheckoutSuccessPage(
  { searchParams }: CheckoutSuccessPageProps,
  deps?: CheckoutSuccessDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<JSX.Element> {
  const resolvedSearchParams = await searchParams;
  const sessionId =
    normalizeSearchParam(resolvedSearchParams.session_id) ?? null;

  // Eager sync persists entitlement before anything renders; invalid,
  // signed-out, and non-entitled outcomes redirect away inside the sync.
  const syncResult = await syncCheckoutSuccess({ sessionId }, deps, redirectFn);
  // DEBT-410: a no-card trial checkout lands here as a trialing subscription.
  const trialStarted = syncResult.status === 'inTrial';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="w-full max-w-md space-y-4 px-4 text-center">
        <h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">
          {trialStarted
            ? 'Your 7-day free trial has started — no charge today'
            : 'You’re all set — your subscription is active'}
        </h1>
        {trialStarted ? (
          <p className="text-base text-muted-foreground">
            Your full access starts now.
          </p>
        ) : null}
        <p aria-live="polite" className="text-base text-muted-foreground">
          You’ll be redirected to your dashboard shortly.
        </p>
        <div className="flex justify-center">
          <Button asChild>
            <Link href={ROUTES.APP_DASHBOARD} replace>
              Go to your dashboard
            </Link>
          </Button>
        </div>
        <CheckoutSuccessRedirect />
      </div>
    </main>
  );
}

export default runCheckoutSuccessPage;
