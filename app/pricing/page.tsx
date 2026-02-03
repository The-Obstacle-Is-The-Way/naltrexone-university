import { redirect } from 'next/navigation';
import { SubscribeButton } from '@/app/pricing/pricing-client';
import { PricingView } from '@/app/pricing/pricing-view';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import type { PricingBanner } from '@/app/pricing/types';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';

export type { PricingViewProps } from '@/app/pricing/pricing-view';
export { runSubscribeAction } from '@/app/pricing/subscribe-action';
export { PricingView };
// Re-export for tests
export type { PricingBanner } from '@/app/pricing/types';

export type PricingPageDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

async function getDeps(deps?: PricingPageDeps): Promise<PricingPageDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  };
}

export async function loadPricingData(
  deps?: PricingPageDeps,
): Promise<{ isEntitled: boolean }> {
  const d = await getDeps(deps);
  const user = await d.authGateway.getCurrentUser();
  if (!user) return { isEntitled: false };

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  return { isEntitled: entitlement.isEntitled };
}

type PricingSearchParams = {
  checkout?: string;
  reason?: string;
  plan?: string;
  error_code?: string;
  error_message?: string;
};

export function getPricingBanner(
  searchParams: PricingSearchParams,
): PricingBanner | null {
  if (searchParams.checkout === 'error') {
    const inDev = process.env.NODE_ENV === 'development';
    const errorCode =
      typeof searchParams.error_code === 'string'
        ? searchParams.error_code
        : null;
    const errorMessage =
      typeof searchParams.error_message === 'string'
        ? searchParams.error_message
        : null;

    return {
      tone: 'error',
      message:
        inDev && errorCode
          ? `Checkout failed (${errorCode}). ${errorMessage ?? 'See server logs for details.'}`
          : 'Checkout failed. Please try again.',
    };
  }

  if (searchParams.checkout === 'cancel') {
    return {
      tone: 'info',
      message: 'Checkout canceled.',
    };
  }

  if (searchParams.reason === 'subscription_required') {
    return {
      tone: 'info',
      message: 'Subscription required to access the app.',
    };
  }

  if (searchParams.reason === 'manage_billing') {
    return {
      tone: 'info',
      message: 'Subscription found. Manage billing to resolve payment issues.',
    };
  }

  if (searchParams.reason === 'payment_processing') {
    return {
      tone: 'info',
      message:
        'Payment processing. It may take a moment for access to activate.',
    };
  }

  return null;
}

export default async function PricingPage({
  searchParams,
  deps,
}: {
  searchParams: Promise<PricingSearchParams>;
  deps?: PricingPageDeps;
}) {
  const { isEntitled } = await loadPricingData(deps);
  const resolvedSearchParams = await searchParams;
  const banner = getPricingBanner(resolvedSearchParams);

  const showManageBillingAction =
    resolvedSearchParams.reason === 'manage_billing' ||
    resolvedSearchParams.reason === 'payment_processing';

  async function manageBilling() {
    'use server';
    const result = await createPortalSession({});
    if (result.ok) {
      redirect(result.data.url);
    }

    if (result.error.code === 'UNAUTHENTICATED') {
      redirect('/sign-up');
    }

    const url = new URL('/pricing', 'https://example.com');
    url.searchParams.set('checkout', 'error');
    url.searchParams.set('error_code', result.error.code);

    if (process.env.NODE_ENV === 'development') {
      const rawMessage = result.error.message;
      const safeMessage =
        rawMessage.length > 200 ? `${rawMessage.slice(0, 200)}…` : rawMessage;
      url.searchParams.set('error_message', safeMessage);
    }

    redirect(`${url.pathname}${url.search}`);
  }

  return (
    <PricingView
      isEntitled={isEntitled}
      banner={banner}
      manageBillingAction={showManageBillingAction ? manageBilling : undefined}
      subscribeMonthlyAction={subscribeMonthlyAction}
      subscribeAnnualAction={subscribeAnnualAction}
      SubscribeButtonComponent={SubscribeButton}
    />
  );
}
