import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { normalizeSearchParam } from '@/lib/search-params';
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
  syncCheckoutSuccess,
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
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

  await syncCheckoutSuccess({ sessionId }, deps, redirectFn);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="text-center">
        <h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">
          Finalizing your subscription…
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          You’ll be redirected to your dashboard shortly.
        </p>
      </div>
    </main>
  );
}

export default runCheckoutSuccessPage;
