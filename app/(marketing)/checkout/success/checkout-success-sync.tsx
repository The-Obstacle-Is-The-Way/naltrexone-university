import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { getSubscriptionPlanFromPriceId } from '@/src/adapters/config/stripe-prices';
import { stripeSubscriptionStatusToSubscriptionStatus } from '@/src/adapters/gateways/stripe';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
import { isSubscriptionObservationAttemptsExhaustedError } from '@/src/application/errors';
import { persistSubscriptionObservation } from '@/src/application/shared/persist-subscription-observation';
import {
  determineNonEntitledReason,
  MS_PER_SECOND,
} from '@/src/domain/services';
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
  CheckoutSuccessSyncResult,
  CheckoutSuccessTransaction,
  SyncCheckoutSuccessInput,
} from './checkout-success-types';

export type {
  CheckoutSuccessDeps,
  CheckoutSuccessSyncResult,
  CheckoutSuccessTransaction,
};
export { getCheckoutSuccessDeps };

const CHECKOUT_ERROR_ROUTE = `${ROUTES.PRICING}?checkout=error`;

type RetryLogInput = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
};

type EffectiveSubscription = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
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
 * first, so entitlement is correct before the user can reach the app.
 *
 * Entitled outcomes resolve with the synced status so the page renders the
 * confirmation interstitial (DEBT-412). Invalid, signed-out, and non-entitled
 * outcomes still redirect away before the page body renders.
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
): Promise<CheckoutSuccessSyncResult> {
  const d = await getCheckoutSuccessDeps(deps);

  const fail = (
    reason: string,
    context: Record<string, unknown> = {},
  ): never => {
    d.logger.info(
      {
        reason,
        route: ROUTES.CHECKOUT_SUCCESS,
        ...context,
      },
      'Checkout success redirected to checkout error',
    );
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
      ...DEFAULT_RETRY_OPTIONS,
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

  const retrieveObservation = async () => {
    const subscription = await retry(
      () => d.stripe.subscriptions.retrieve(subscriptionId),
      {
        ...DEFAULT_RETRY_OPTIONS,
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
    assertions.assertNonEmptyString(
      stripeStatus,
      'invalid_subscription_status',
      {
        sessionId,
        status: stripeStatus ?? null,
      },
    );
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
    assertions.assertBoolean(
      cancelAtPeriodEnd,
      'missing_cancel_at_period_end',
      {
        sessionId,
        cancelAtPeriodEnd: cancelAtPeriodEnd ?? null,
      },
    );

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

    return {
      cancelAtPeriodEnd,
      currentPeriodEnd: new Date(currentPeriodEndSeconds * MS_PER_SECOND),
      externalSubscriptionId: subscriptionId,
      plan,
      status,
      userId: metadataUserId,
    };
  };

  let effectiveSubscription: EffectiveSubscription;
  try {
    const { observation, write } = await persistSubscriptionObservation({
      userId: user.id,
      readVersion: (userId) =>
        d.subscriptionVersions.findObservationVersionByUserId(userId),
      retrieve: retrieveObservation,
      getUserId: (subscription) => subscription.userId,
      persist: (subscription, expectedVersion) =>
        d.transaction(async ({ stripeCustomers, subscriptions }) => {
          // Stripe webhook, checkout-success, and reconcile use advisory(user)
          // -> stripe_subscriptions -> stripe_customers. User deletion is the
          // fourth writer and takes the same advisory before its inverse cascade.
          const result = await subscriptions.upsert({
            userId: subscription.userId,
            externalSubscriptionId: subscription.externalSubscriptionId,
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            expectedVersion,
          });

          if (result.persisted) {
            await stripeCustomers.insert(user.id, stripeCustomerId, {
              conflictStrategy: 'authoritative',
            });
          }

          return result;
        }),
    });

    effectiveSubscription = write.persisted ? observation : write.current;
  } catch (error) {
    if (!isSubscriptionObservationAttemptsExhaustedError(error)) {
      throw error;
    }

    const logContext = {
      attempts: error.attempts,
      reason: error.reason,
      userId: user.id,
    };
    const current = await d.transaction(({ subscriptions }) =>
      subscriptions.findByUserId(user.id),
    );
    if (current === null) {
      d.logger.error(
        logContext,
        'Checkout success CAS exhausted with no current subscription row',
      );
      throw error;
    }

    d.logger.info(
      logContext,
      'Checkout success recovered entitlement from current row after CAS exhaustion',
    );
    effectiveSubscription = current;
  }

  const effectiveStatus = effectiveSubscription.status;
  const effectiveCurrentPeriodEnd = effectiveSubscription.currentPeriodEnd;
  const hasActiveSubscriptionPeriod =
    effectiveCurrentPeriodEnd.getTime() > Date.now();
  const isEntitled =
    isEntitledStatus(effectiveStatus) && hasActiveSubscriptionPeriod;

  if (!isEntitled) {
    const reason = determineNonEntitledReason(
      effectiveStatus,
      hasActiveSubscriptionPeriod,
    );

    redirectFn(`${ROUTES.PRICING}?reason=${reason}`);
    return { status: effectiveStatus };
  }

  return { status: effectiveStatus };
}
