import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import { SubscribeButton } from './pricing-client';
import { PricingView } from './pricing-view';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from './subscribe-actions';
import type { PricingBanner } from './types';

export type { PricingViewProps } from './pricing-view';
export { runSubscribeAction } from './subscribe-action';
export { PricingView };
// Re-export for tests
export type { PricingBanner } from './types';

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

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
};

export function getPricingBanner(
  searchParams: PricingSearchParams,
): PricingBanner | null {
  if (searchParams.checkout === 'error') {
    return {
      tone: 'error',
      message: 'Checkout failed. Please try again.',
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

  return null;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<PricingSearchParams>;
}) {
  const { isEntitled } = await loadPricingData();
  const resolvedSearchParams = await searchParams;
  const banner = getPricingBanner(resolvedSearchParams);

  return (
    <PricingView
      isEntitled={isEntitled}
      banner={banner}
      subscribeMonthlyAction={subscribeMonthlyAction}
      subscribeAnnualAction={subscribeAnnualAction}
      SubscribeButtonComponent={SubscribeButton}
    />
  );
}
