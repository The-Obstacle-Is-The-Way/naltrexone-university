import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { ROUTES } from '@/lib/routes';
import { getSubscriptionPlanFromPriceId } from '@/src/adapters/config/stripe-prices';
import { stripeSubscriptionStatusToSubscriptionStatus } from '@/src/adapters/gateways/stripe';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { determineNonEntitledReason } from '@/src/domain/services';
import {
  isEntitledStatus,
  type SubscriptionStatus,
} from '@/src/domain/value-objects';
import {
  type CheckoutSuccessAssertions,
  createCheckoutSuccessAssertions,
} from './checkout-success-assertions';
import { getCheckoutSuccessDeps } from './checkout-success-deps';
import type {
  CheckoutSuccessDeps,
  CheckoutSuccessSearchParams,
  CheckoutSuccessTransaction,
  SyncCheckoutSuccessInput,
} from './checkout-success-types';
export type { CheckoutSuccessDeps, CheckoutSuccessTransaction };
export { getCheckoutSuccessDeps };

const CHECKOUT_ERROR_ROUTE = `${ROUTES.PRICING}?checkout=error`;
const STRIPE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
} as const;

type RetryLogInput = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
};

function createStripeOnRetry(
  logger: CheckoutSuccessDeps['logger'],
  context: Record<string, unknown>,
): (input: RetryLogInput) => void {
  return ({ attempt, maxAttempts, delayMs, error }) => {
    const logContext = {
      ...context,
      attempt,
      maxAttempts,
      delayMs,
      error: error instanceof Error ? error.message : String(error),
    };

    if (logger.warn) {
      logger.warn(logContext, 'Retrying Stripe API call');
      return;
    }

    logger.error(logContext, 'Retrying Stripe API call');
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
  const d = await getCheckoutSuccessDeps(deps);

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

  const assertions: CheckoutSuccessAssertions =
    createCheckoutSuccessAssertions(fail);

  const sessionId = input.sessionId;
  // Users can land here via direct navigation or a tampered URL; treat missing
  // session_id as an invalid checkout completion.
  assertions.assertNonEmptyString(sessionId, 'missing_session_id', {
    sessionId,
  });

  const clerkAuth = await d.getClerkAuth();
  if (!clerkAuth.userId) {
    const returnBackUrl = new URL(ROUTES.CHECKOUT_SUCCESS, d.appUrl);
    returnBackUrl.searchParams.set('session_id', sessionId);
    return clerkAuth.redirectToSignIn({ returnBackUrl });
  }

  const user = await d.authGateway.requireUser();

  const session = await retry(
    () =>
      d.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      }),
    {
      ...STRIPE_RETRY_OPTIONS,
      shouldRetry: isTransientExternalError,
      onRetry: createStripeOnRetry(d.logger, { sessionId }),
    },
  );

  const stripeCustomerId = getStripeId(session.customer);
  const subscriptionId = getStripeId(session.subscription);
  // A completed subscription checkout must have both a customer and a subscription.
  assertions.assertNonEmptyString(stripeCustomerId, 'missing_stripe_ids', {
    sessionId,
    stripeCustomerId,
    subscriptionId,
  });
  assertions.assertNonEmptyString(subscriptionId, 'missing_stripe_ids', {
    sessionId,
    stripeCustomerId,
    subscriptionId,
  });

  const subscription = await retry(
    () => d.stripe.subscriptions.retrieve(subscriptionId),
    {
      ...STRIPE_RETRY_OPTIONS,
      shouldRetry: isTransientExternalError,
      onRetry: createStripeOnRetry(d.logger, { subscriptionId }),
    },
  );

  const metadataUserId = subscription.metadata?.user_id;
  assertions.assertNonEmptyString(metadataUserId, 'missing_user_id', {
    sessionId,
    metadataUserId: metadataUserId ?? null,
  });
  // Prevent cross-account leakage if the user switches accounts mid-checkout.
  if (metadataUserId !== user.id) {
    fail('user_id_mismatch', {
      sessionId,
      metadataUserId,
      userId: user.id,
    });
  }

  const stripeStatus = subscription.status;
  // Reject malformed subscription objects and unexpected statuses.
  assertions.assertNonEmptyString(stripeStatus, 'invalid_subscription_status', {
    sessionId,
    status: stripeStatus ?? null,
  });
  assertions.assertStripeSubscriptionStatus(
    stripeStatus,
    'invalid_subscription_status',
    {
      sessionId,
      status: stripeStatus,
    },
  );
  const status: SubscriptionStatus =
    stripeSubscriptionStatusToSubscriptionStatus(stripeStatus);

  const subscriptionItem = subscription.items?.data?.[0];

  const currentPeriodEndSeconds = subscriptionItem?.current_period_end;
  // Entitlement depends on a current billing period end timestamp.
  assertions.assertNumber(
    currentPeriodEndSeconds,
    'missing_current_period_end',
    {
      sessionId,
      currentPeriodEndSeconds: currentPeriodEndSeconds ?? null,
    },
  );

  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  // We persist cancel-at-period-end to display accurately in billing UI.
  assertions.assertBoolean(cancelAtPeriodEnd, 'missing_cancel_at_period_end', {
    sessionId,
    cancelAtPeriodEnd: cancelAtPeriodEnd ?? null,
  });

  const priceId = subscriptionItem?.price?.id;
  // We map the Stripe price id back to a domain plan (monthly/annual).
  assertions.assertNonEmptyString(priceId, 'missing_price_id', {
    sessionId,
    priceId: priceId ?? null,
  });

  const plan = getSubscriptionPlanFromPriceId(priceId, d.priceIds);
  // Mismatched price IDs usually means environment misconfiguration.
  assertions.assertNotNull(plan, 'unknown_plan', {
    sessionId,
    priceId,
    configuredPriceIds: d.priceIds,
  });

  const currentPeriodEnd = new Date(currentPeriodEndSeconds * 1000);

  await d.transaction(async ({ stripeCustomers, subscriptions }) => {
    await stripeCustomers.insert(user.id, stripeCustomerId, {
      conflictStrategy: 'authoritative',
    });
    await subscriptions.upsert({
      userId: user.id,
      externalSubscriptionId: subscriptionId,
      plan,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    });
  });

  const hasActiveSubscriptionPeriod = currentPeriodEnd.getTime() > Date.now();
  const isEntitled = isEntitledStatus(status) && hasActiveSubscriptionPeriod;

  if (!isEntitled) {
    const reason = determineNonEntitledReason(
      status,
      hasActiveSubscriptionPeriod,
    );

    return redirectFn(`${ROUTES.PRICING}?reason=${reason}`);
  }

  return redirectFn(ROUTES.APP_DASHBOARD);
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
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Finalizing your subscription…
        </h1>
        <p className="mt-2 text-muted-foreground">
          You’ll be redirected to your dashboard shortly.
        </p>
      </div>
    </main>
  );
}
