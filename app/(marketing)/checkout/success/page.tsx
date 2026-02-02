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
import {
  isValidSubscriptionStatus,
  type SubscriptionStatus,
} from '@/src/domain/value-objects';

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

type ClerkAuthLike = {
  userId: string | null;
  redirectToSignIn: (opts: { returnBackUrl: string | URL }) => never;
};

type CheckoutSuccessLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
};

export type CheckoutSuccessTransaction = {
  stripeCustomers: StripeCustomerRepository;
  subscriptions: SubscriptionRepository;
};

export type CheckoutSuccessDeps = {
  authGateway: AuthGateway;
  getClerkAuth: () => Promise<ClerkAuthLike>;
  logger: CheckoutSuccessLogger;
  stripe: StripeClientLike;
  priceIds: StripePriceIds;
  appUrl: string;
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
  const { auth } = await import('@clerk/nextjs/server');

  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    getClerkAuth: auth,
    logger: container.logger,
    stripe,
    priceIds: {
      monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
      annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
    },
    appUrl: container.env.NEXT_PUBLIC_APP_URL,
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
  const d = await getDeps(deps);

  const fail = (
    reason: string,
    context: Record<string, unknown> = {},
  ): never => {
    d.logger.error(
      {
        reason,
        ...context,
      },
      'Checkout success validation failed',
    );
    return redirectFn(CHECKOUT_ERROR_ROUTE);
  };

  function assertNotNull<T>(
    value: T | null,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is T {
    if (value === null) {
      fail(reason, context);
    }
  }

  function assertNonEmptyString(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
      fail(reason, context);
    }
  }

  function assertNumber(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is number {
    if (typeof value !== 'number') {
      fail(reason, context);
    }
  }

  function assertBoolean(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is boolean {
    if (typeof value !== 'boolean') {
      fail(reason, context);
    }
  }

  function assertSubscriptionStatus(
    value: string,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is SubscriptionStatus {
    if (!isValidSubscriptionStatus(value)) {
      fail(reason, context);
    }
  }

  const sessionId = input.sessionId;
  assertNonEmptyString(sessionId, 'missing_session_id', { sessionId });

  const clerkAuth = await d.getClerkAuth();
  if (!clerkAuth.userId) {
    const returnBackUrl = new URL(ROUTES.CHECKOUT_SUCCESS, d.appUrl);
    returnBackUrl.searchParams.set('session_id', sessionId);
    return clerkAuth.redirectToSignIn({ returnBackUrl });
  }

  const user = await d.authGateway.requireUser();

  const session = await d.stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });

  const stripeCustomerId = getStripeId(session.customer);
  const subscriptionId = getStripeId(session.subscription);
  assertNonEmptyString(stripeCustomerId, 'missing_stripe_ids', {
    sessionId,
    stripeCustomerId,
    subscriptionId,
  });
  assertNonEmptyString(subscriptionId, 'missing_stripe_ids', {
    sessionId,
    stripeCustomerId,
    subscriptionId,
  });

  const subscription = await d.stripe.subscriptions.retrieve(subscriptionId);

  const metadataUserId = subscription.metadata?.user_id;
  if (metadataUserId && metadataUserId !== user.id) {
    fail('user_id_mismatch', {
      sessionId,
      metadataUserId,
      userId: user.id,
    });
  }

  const status = subscription.status;
  assertNonEmptyString(status, 'invalid_subscription_status', {
    sessionId,
    status: status ?? null,
  });
  assertSubscriptionStatus(status, 'invalid_subscription_status', {
    sessionId,
    status,
  });

  const currentPeriodEndSeconds = subscription.current_period_end;
  assertNumber(currentPeriodEndSeconds, 'missing_current_period_end', {
    sessionId,
    currentPeriodEndSeconds: currentPeriodEndSeconds ?? null,
  });

  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  assertBoolean(cancelAtPeriodEnd, 'missing_cancel_at_period_end', {
    sessionId,
    cancelAtPeriodEnd: cancelAtPeriodEnd ?? null,
  });

  const priceId = subscription.items?.data?.[0]?.price?.id;
  assertNonEmptyString(priceId, 'missing_price_id', {
    sessionId,
    priceId: priceId ?? null,
  });

  const plan = getSubscriptionPlanFromPriceId(priceId, d.priceIds);
  assertNotNull(plan, 'unknown_plan', {
    sessionId,
    priceId,
    configuredPriceIds: d.priceIds,
  });

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
