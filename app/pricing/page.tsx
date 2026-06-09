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
import type { SubscriptionStatus } from '@/src/domain/value-objects';

export const metadata: Metadata = {
  title: 'Pricing - Addiction Boards',
};

export const maxDuration = 30;

export type { PricingViewProps } from '@/app/pricing/pricing-view';
export { runSubscribeAction } from '@/app/pricing/subscribe-action';
// Re-export for tests
export type { PricingBanner } from '@/app/pricing/types';
export { PricingView };

export type PricingPageDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

export type PricingData = {
  isEntitled: boolean;
  reason: NonEntitledReason | null;
  /** null means no subscription record exists (trial-eligible per DEBT-410 D9). */
  subscriptionStatus: SubscriptionStatus | null;
};

export async function loadPricingData(
  deps?: PricingPageDeps,
): Promise<PricingData> {
  const authState = await getRequestAuthState({ deps });
  if (!authState.user) {
    return {
      // Anonymous pricing visits should not show a banner (DEBT-410 PR-1).
      isEntitled: false,
      reason: null,
      subscriptionStatus: null,
    };
  }

  return {
    isEntitled: authState.entitlement.isEntitled,
    reason: authState.entitlement.reason ?? null,
    subscriptionStatus: authState.entitlement.subscriptionStatus ?? null,
  };
}

type PricingSearchParams = {
  checkout?: string | string[] | undefined;
  reason?: string | string[] | undefined;
  plan?: string;
};

export type PricingTrialContext = {
  freeTrialEnabled: boolean;
  subscriptionStatus: SubscriptionStatus | null;
};

export function getPricingBanner(
  searchParams: PricingSearchParams,
  trialContext?: PricingTrialContext,
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
    if (trialContext?.freeTrialEnabled) {
      // No subscription record at all = trial-eligible (DEBT-410 D9).
      if (trialContext.subscriptionStatus === null) {
        return {
          tone: 'info',
          message:
            'Start your free trial to access the app — no card required.',
        };
      }
      // A lapsed trial cancels with its period already over, so it arrives
      // here (not as subscription_canceled).
      if (trialContext.subscriptionStatus === 'canceled') {
        return {
          tone: 'info',
          message: 'Your free trial ended — choose a plan to continue.',
        };
      }
    }
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

  if (reason === 'subscription_canceled') {
    return {
      tone: 'info',
      message:
        'Your subscription is inactive. Choose a plan to restart access.',
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

// Shared by both render paths so banner/CTA decisions cannot drift apart.
function buildPricingPresentation(
  pricingData: PricingData,
  resolvedSearchParams: PricingSearchParams,
): {
  banner: PricingBanner | null;
  showManageBillingAction: boolean;
  showTrialCtas: boolean;
} {
  // Kill-switch read (DEBT-410 D10); same direct-env pattern as
  // NEXT_PUBLIC_SKIP_CLERK in components/get-started-cta.tsx.
  const freeTrialEnabled = process.env.FREE_TRIAL_ENABLED === 'true';
  const reason = normalizeSearchParam(resolvedSearchParams.reason);
  const effectiveReason = reason ?? pricingData.reason ?? undefined;
  const banner = getPricingBanner(
    {
      ...resolvedSearchParams,
      reason: effectiveReason,
    },
    {
      freeTrialEnabled,
      subscriptionStatus: pricingData.subscriptionStatus,
    },
  );

  return {
    banner,
    showManageBillingAction:
      effectiveReason === 'manage_billing' ||
      effectiveReason === 'payment_processing',
    showTrialCtas:
      freeTrialEnabled &&
      !pricingData.isEntitled &&
      pricingData.subscriptionStatus === null,
  };
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
  const { banner, showManageBillingAction, showTrialCtas } =
    buildPricingPresentation(pricingData, resolvedSearchParams);

  return (
    <PricingView
      isEntitled={pricingData.isEntitled}
      banner={banner}
      showTrialCtas={showTrialCtas}
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
  const { banner, showManageBillingAction, showTrialCtas } =
    buildPricingPresentation(pricingData, resolvedSearchParams);

  return MarketingLayout({
    authNavSlot,
    featuresHref: `${ROUTES.HOME}#features`,
    children: (
      <PricingView
        isEntitled={pricingData.isEntitled}
        banner={banner}
        showTrialCtas={showTrialCtas}
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
