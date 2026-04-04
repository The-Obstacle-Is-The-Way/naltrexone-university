import type { Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';
import { manageBillingAction } from '@/app/pricing/manage-billing-actions';
import { SubscribeButton } from '@/app/pricing/pricing-client';
import { PricingView } from '@/app/pricing/pricing-view';
import { PricingViewSkeleton } from '@/app/pricing/pricing-view-skeleton';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import type { PricingBanner } from '@/app/pricing/types';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { getRequestAuthState } from '@/lib/auth-request-cache';
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

export async function loadPricingData(deps?: PricingPageDeps): Promise<{
  isEntitled: boolean;
  reason: NonEntitledReason | null;
}> {
  const authState = await getRequestAuthState({ deps });
  if (!authState.user) {
    return {
      isEntitled: false,
      reason: 'subscription_required',
    };
  }

  return {
    isEntitled: authState.entitlement.isEntitled,
    reason: authState.entitlement.reason ?? null,
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

async function DeferredPricingView({
  searchParams,
  deps,
}: {
  searchParams: Promise<PricingSearchParams>;
  deps?: PricingPageDeps;
}) {
  const [pricingData, resolvedSearchParams] = await Promise.all([
    loadPricingData(deps),
    searchParams,
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
  );
}

async function renderInjectedPricingPage(input: {
  searchParams: Promise<PricingSearchParams>;
  deps?: PricingPageDeps;
  authNavFn?: () => ReactNode | Promise<ReactNode>;
}) {
  const resolvedAuthNavFn =
    input.authNavFn ??
    (async () => {
      const { MarketingAuthNavFallback } = await import(
        '@/components/marketing/marketing-layout'
      );
      return <MarketingAuthNavFallback />;
    });
  const [pricingData, resolvedSearchParams, authNavSlot] = await Promise.all([
    loadPricingData(input.deps),
    input.searchParams,
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

  return MarketingLayout({
    authNavSlot,
    featuresHref: `${ROUTES.HOME}#features`,
    children: (
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
    ),
  });
}

export default async function PricingPage({
  searchParams,
  deps,
  authNavFn,
}: {
  searchParams: Promise<PricingSearchParams>;
  deps?: PricingPageDeps;
  authNavFn?: () => ReactNode | Promise<ReactNode>;
}) {
  if (deps || authNavFn) {
    return renderInjectedPricingPage({ searchParams, deps, authNavFn });
  }

  const pricingFallback = await PricingViewSkeleton();

  return MarketingLayout({
    featuresHref: `${ROUTES.HOME}#features`,
    children: (
      <Suspense fallback={pricingFallback}>
        <DeferredPricingView searchParams={searchParams} />
      </Suspense>
    ),
  });
}
