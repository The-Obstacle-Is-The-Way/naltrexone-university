import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { ROUTES } from '@/lib/routes';
import {
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '@/src/adapters/config/stripe-prices';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import { isValidSubscriptionStatus } from '@/src/domain/value-objects';

type StripeCheckoutSessionLike = { customer?: unknown; subscription?: unknown };

type StripeSubscriptionLike = {
  id?: string;
  customer?: unknown;
  status?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

type StripeClientLike = {
  checkout: {
    sessions: {
      retrieve: (
        sessionId: string,
        params?: { expand?: string[] },
      ) => Promise<StripeCheckoutSessionLike>;
    };
  };
  subscriptions: {
    retrieve: (subscriptionId: string) => Promise<StripeSubscriptionLike>;
  };
};

export type CheckoutSuccessTransaction = {
  stripeCustomers: StripeCustomerRepository;
  subscriptions: SubscriptionRepository;
};

export type CheckoutSuccessDeps = {
  authGateway: AuthGateway;
  stripe: StripeClientLike;
  priceIds: StripePriceIds;
  transaction: <T>(
    fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
  ) => Promise<T>;
};

type SyncCheckoutSuccessInput = {
  sessionId: string | null;
};

const CHECKOUT_ERROR_ROUTE = `${ROUTES.PRICING}?checkout=error`;

type CheckoutSuccessSearchParams = {
  session_id?: string;
};

async function getDeps(
  deps?: CheckoutSuccessDeps,
): Promise<CheckoutSuccessDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  const { stripe } = await import('@/lib/stripe');

  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    stripe,
    priceIds: {
      monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
      annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
    },
    transaction: async (fn) =>
      container.db.transaction(async (tx) =>
        fn({
          stripeCustomers: container.createStripeCustomerRepository(tx),
          subscriptions: container.createSubscriptionRepository(tx),
        }),
      ),
  };
}

function getStripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;

  const record = value as { id?: unknown };
  return typeof record.id === 'string' ? record.id : null;
}

/**
 * Eagerly sync the user's subscription after checkout completion.
 *
 * Stripe webhooks are eventually consistent; users often reach the success page
 * before the webhook updates our database. This function fetches the checkout
 * session/subscription from Stripe and upserts the minimal subscription state
 * before redirecting so entitlement is correct immediately.
 *
 * Webhooks remain necessary for lifecycle events when the user is not present
 * (renewals, payment failures, admin actions).
 *
 * See ADR-014: Stripe eager sync pattern.
 */
export async function syncCheckoutSuccess(
  input: SyncCheckoutSuccessInput,
  deps?: CheckoutSuccessDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<void> {
  if (!input.sessionId) redirectFn(CHECKOUT_ERROR_ROUTE);

  const d = await getDeps(deps);
  const user = await d.authGateway.requireUser();

  const session = await d.stripe.checkout.sessions.retrieve(input.sessionId, {
    expand: ['subscription'],
  });

  const stripeCustomerId = getStripeId(session.customer);
  const subscriptionId = getStripeId(session.subscription);
  if (!stripeCustomerId || !subscriptionId) redirectFn(CHECKOUT_ERROR_ROUTE);

  const subscription =
    typeof session.subscription === 'object' && session.subscription !== null
      ? (session.subscription as StripeSubscriptionLike)
      : await d.stripe.subscriptions.retrieve(subscriptionId);

  const metadataUserId = subscription.metadata?.user_id;
  if (metadataUserId && metadataUserId !== user.id)
    redirectFn(CHECKOUT_ERROR_ROUTE);

  const status = subscription.status;
  if (!status || !isValidSubscriptionStatus(status))
    redirectFn(CHECKOUT_ERROR_ROUTE);

  const currentPeriodEndSeconds = subscription.current_period_end;
  if (typeof currentPeriodEndSeconds !== 'number')
    redirectFn(CHECKOUT_ERROR_ROUTE);

  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  if (typeof cancelAtPeriodEnd !== 'boolean') redirectFn(CHECKOUT_ERROR_ROUTE);

  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) redirectFn(CHECKOUT_ERROR_ROUTE);

  const plan = getSubscriptionPlanFromPriceId(priceId, d.priceIds);
  if (!plan) redirectFn(CHECKOUT_ERROR_ROUTE);

  await d.transaction(async ({ stripeCustomers, subscriptions }) => {
    await stripeCustomers.insert(user.id, stripeCustomerId);
    await subscriptions.upsert({
      userId: user.id,
      stripeSubscriptionId: subscriptionId,
      plan,
      status,
      currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
      cancelAtPeriodEnd,
    });
  });

  redirectFn(ROUTES.APP_DASHBOARD);
}

export async function runCheckoutSuccessPage(
  { searchParams }: { searchParams: Promise<CheckoutSuccessSearchParams> },
  deps?: CheckoutSuccessDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<JSX.Element> {
  const resolvedSearchParams = await searchParams;
  await syncCheckoutSuccess(
    { sessionId: resolvedSearchParams.session_id ?? null },
    deps,
    redirectFn,
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Finalizing your subscription…
        </h1>
        <p className="mt-2 text-muted-foreground">
          You’ll be redirected to your dashboard shortly.
        </p>
      </div>
    </div>
  );
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<CheckoutSuccessSearchParams>;
}) {
  return runCheckoutSuccessPage({ searchParams });
}
