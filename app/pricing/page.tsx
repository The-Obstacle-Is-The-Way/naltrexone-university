import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { manageBillingAction } from '@/app/pricing/manage-billing-actions';
import { SubscribeButton } from '@/app/pricing/pricing-client';
import { PricingView } from '@/app/pricing/pricing-view';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import type { PricingBanner } from '@/app/pricing/types';
import { AuthNav } from '@/components/auth-nav';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ROUTES } from '@/lib/routes';
import { normalizeSearchParam } from '@/lib/search-params';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { CheckEntitlementUseCase } from '@/src/application/ports/use-cases';
import type { NonEntitledReason } from '@/src/application/use-cases/check-entitlement';

export const metadata: Metadata = {
  title: 'Pricing - Addiction Boards',
};

export const maxDuration = 30;

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

export async function loadPricingData(deps?: PricingPageDeps): Promise<{
  isEntitled: boolean;
  reason: NonEntitledReason | null;
}> {
  const d = await getDeps(deps);
  const user = await d.authGateway.getCurrentUser();
  if (!user) {
    return {
      isEntitled: false,
      reason: 'subscription_required',
    };
  }

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  return {
    isEntitled: entitlement.isEntitled,
    reason: entitlement.reason ?? null,
  };
}

type PricingSearchParams = {
  checkout?: string | string[] | undefined;
  reason?: string | string[] | undefined;
  plan?: string;
};

export function getPricingBanner(
  searchParams: PricingSearchParams,
): PricingBanner | null {
  const checkout = normalizeSearchParam(searchParams.checkout);
  const reason = normalizeSearchParam(searchParams.reason);

  if (checkout === 'rate_limited') {
    return {
      tone: 'info',
      message: 'Too many checkout attempts. Please wait and try again.',
    };
  }

  if (checkout === 'error') {
    return {
      tone: 'error',
      message: 'Checkout failed. Please try again.',
    };
  }

  if (checkout === 'cancel') {
    return {
      tone: 'info',
      message: 'Checkout canceled.',
    };
  }

  if (reason === 'subscription_required') {
    return {
      tone: 'info',
      message: 'Subscription required to access the app.',
    };
  }

  if (reason === 'manage_billing') {
    return {
      tone: 'info',
      message: 'Subscription found. Manage billing to resolve payment issues.',
    };
  }

  if (reason === 'payment_processing') {
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
  authNavFn,
}: {
  searchParams: Promise<PricingSearchParams>;
  deps?: PricingPageDeps;
  authNavFn?: () => Promise<ReactNode>;
}) {
  const resolvedAuthNavFn = authNavFn ?? (() => AuthNav());
  const [pricingData, resolvedSearchParams, authNav] = await Promise.all([
    loadPricingData(deps),
    searchParams,
    resolvedAuthNavFn(),
  ]);
  const reason = normalizeSearchParam(resolvedSearchParams.reason);
  const effectiveReason = reason ?? pricingData.reason ?? undefined;
  const banner = getPricingBanner({
    ...resolvedSearchParams,
    reason: effectiveReason,
  });

  const showManageBillingAction =
    effectiveReason === 'manage_billing' ||
    effectiveReason === 'payment_processing';

  return (
    <MarketingLayout authNav={authNav} featuresHref={`${ROUTES.HOME}#features`}>
      <PricingView
        isEntitled={pricingData.isEntitled}
        banner={banner}
        manageBillingAction={
          showManageBillingAction ? manageBillingAction : undefined
        }
        subscribeMonthlyAction={subscribeMonthlyAction}
        subscribeAnnualAction={subscribeAnnualAction}
        SubscribeButtonComponent={SubscribeButton}
      />
    </MarketingLayout>
  );
}
