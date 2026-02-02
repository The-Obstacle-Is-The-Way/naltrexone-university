import { redirect } from 'next/navigation';
import { createCheckoutSession } from '@/src/adapters/controllers/billing-controller';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import { PricingClient } from './pricing-client';
import type { PricingBanner } from './types';

export type { PricingViewProps } from './pricing-view';
export { PricingView } from './pricing-view';
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

type RedirectFn = (url: string) => never;

type SubscribeActionInput = {
  plan: 'monthly' | 'annual';
};

type SubscribeActionDeps = {
  createCheckoutSessionFn: typeof createCheckoutSession;
  redirectFn: RedirectFn;
};

export async function runSubscribeAction(
  input: SubscribeActionInput,
  deps: SubscribeActionDeps,
): Promise<void> {
  const result = await deps.createCheckoutSessionFn({ plan: input.plan });
  if (result.ok) {
    deps.redirectFn(result.data.url);
  }

  if (result.error.code === 'UNAUTHENTICATED') {
    deps.redirectFn('/sign-up');
  }

  deps.redirectFn('/pricing?checkout=error');
}

export function createSubscribeAction(
  plan: SubscribeActionInput['plan'],
): () => Promise<void> {
  return async function subscribe() {
    'use server';
    await runSubscribeAction(
      { plan },
      { createCheckoutSessionFn: createCheckoutSession, redirectFn: redirect },
    );
  };
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<PricingSearchParams>;
}) {
  const { isEntitled } = await loadPricingData();
  const resolvedSearchParams = await searchParams;
  const banner = getPricingBanner(resolvedSearchParams);

  const subscribeMonthly = createSubscribeAction('monthly');
  const subscribeAnnual = createSubscribeAction('annual');

  return (
    <PricingClient
      isEntitled={isEntitled}
      initialBanner={banner}
      subscribeMonthlyAction={subscribeMonthly}
      subscribeAnnualAction={subscribeAnnual}
    />
  );
}
