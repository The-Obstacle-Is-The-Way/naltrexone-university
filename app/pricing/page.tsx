import { manageBillingAction } from '@/app/pricing/manage-billing-actions';
import { SubscribeButton } from '@/app/pricing/pricing-client';
import { PricingView } from '@/app/pricing/pricing-view';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import type { PricingBanner } from '@/app/pricing/types';
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

  return (
    <PricingView
      isEntitled={isEntitled}
      banner={banner}
      manageBillingAction={
        showManageBillingAction ? manageBillingAction : undefined
      }
      subscribeMonthlyAction={subscribeMonthlyAction}
      subscribeAnnualAction={subscribeAnnualAction}
      SubscribeButtonComponent={SubscribeButton}
    />
  );
}
