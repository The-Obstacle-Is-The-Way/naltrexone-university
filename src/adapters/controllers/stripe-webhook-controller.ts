import { STACK_TRACE_LIMIT } from '@/src/adapters/shared/error-logging-constants';
import {
  isE2EOwnerMismatchEvent,
  isMissingStripeSubscriptionUserIdError,
} from '@/src/adapters/shared/stripe-subscription-errors';
import { isApplicationError } from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import { DAY_MS } from '@/src/domain/services';

export type StripeWebhookInput = {
  rawBody: string;
  signature: string;
};

export type StripeWebhookTransaction = {
  stripeEvents: StripeEventRepository;
  subscriptions: SubscriptionRepository;
  stripeCustomers: StripeCustomerRepository;
};

export type StripeWebhookDeps = {
  paymentGateway: PaymentGateway;
  transaction: <T>(
    fn: (tx: StripeWebhookTransaction) => Promise<T>,
  ) => Promise<T>;
  logger: Logger;
  now: () => Date;
};

type StripeWebhookEvent = Awaited<
  ReturnType<PaymentGateway['processWebhookEvent']>
>;

const STRIPE_EVENTS_RETENTION_MS = 90 * DAY_MS;
const STRIPE_EVENTS_PRUNE_LIMIT = 100;

function toErrorData(error: unknown): string {
  if (isApplicationError(error)) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      fieldErrors: error.fieldErrors ?? undefined,
      stack: error.stack?.slice(0, STACK_TRACE_LIMIT),
    });
  }

  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, STACK_TRACE_LIMIT),
    });
  }

  return JSON.stringify({ message: 'Unknown error', raw: String(error) });
}

async function persistFailure(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
  error: unknown,
): Promise<void> {
  const errorData = toErrorData(error);

  try {
    await deps.transaction(async ({ stripeEvents }) => {
      await stripeEvents.claim(event.eventId, event.type);
      const current = await stripeEvents.lock(event.eventId);

      if (current.processedAt !== null && current.error === null) {
        return;
      }

      await stripeEvents.markFailed(event.eventId, errorData);
    });
  } catch (persistError) {
    deps.logger.error(
      {
        eventId: event.eventId,
        error:
          persistError instanceof Error
            ? persistError.message
            : String(persistError),
      },
      'Failed to persist Stripe webhook failure state',
    );
  }
}

export async function processStripeWebhook(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
): Promise<void> {
  let event: StripeWebhookEvent;
  try {
    event = await deps.paymentGateway.processWebhookEvent(
      input.rawBody,
      input.signature,
    );
  } catch (error) {
    if (isMissingStripeSubscriptionUserIdError(error)) {
      deps.logger.warn(
        {
          reason: 'metadata_missing',
          code: error.code,
          fieldErrors: error.fieldErrors,
        },
        'Skipping Stripe subscription webhook with missing metadata.user_id',
      );
      return;
    }

    if (isE2EOwnerMismatchEvent(error)) {
      deps.logger.warn(
        {
          reason: 'e2e_owner_mismatch',
          code: error.code,
          fieldErrors: error.fieldErrors,
        },
        'Skipping Stripe subscription webhook from a different E2E owner',
      );
      return;
    }

    throw error;
  }

  let processingError: unknown;
  let hasProcessingError = false;

  try {
    await deps.transaction(
      async ({ stripeEvents, subscriptions, stripeCustomers }) => {
        const claimed = await stripeEvents.claim(event.eventId, event.type);
        if (!claimed) {
          const snapshot = await stripeEvents.peek(event.eventId);
          if (
            snapshot &&
            snapshot.processedAt !== null &&
            snapshot.error === null
          ) {
            return;
          }
        }

        const current = await stripeEvents.lock(event.eventId);
        if (current.processedAt !== null && current.error === null) {
          return;
        }

        try {
          if (event.subscriptionUpdate) {
            // Canonical multi-repository lock order: advisory(user) in
            // subscriptions.upsert -> stripe_subscriptions row ->
            // stripe_customers row. Keep every writer in this order.
            const write = await subscriptions.upsert({
              userId: event.subscriptionUpdate.userId,
              externalSubscriptionId:
                event.subscriptionUpdate.externalSubscriptionId,
              plan: event.subscriptionUpdate.plan,
              status: event.subscriptionUpdate.status,
              currentPeriodEnd: event.subscriptionUpdate.currentPeriodEnd,
              cancelAtPeriodEnd: event.subscriptionUpdate.cancelAtPeriodEnd,
            });

            if (write.persisted) {
              await stripeCustomers.insert(
                event.subscriptionUpdate.userId,
                event.subscriptionUpdate.externalCustomerId,
                { conflictStrategy: 'authoritative' },
              );
            }
          }

          await stripeEvents.markProcessed(event.eventId);
        } catch (error) {
          processingError = error;
          hasProcessingError = true;
          throw error;
        }
      },
    );
  } catch (transactionError) {
    const originalError = hasProcessingError
      ? processingError
      : transactionError;
    await persistFailure(deps, event, originalError);
    throw originalError;
  }

  // Best-effort cleanup: prune old stripe events.
  // Idempotency keys and rate limits are pruned in their own hot paths
  // (withIdempotency and DrizzleRateLimiter.limit respectively).
  const cutoff = new Date(deps.now().getTime() - STRIPE_EVENTS_RETENTION_MS);

  try {
    await deps.transaction(async ({ stripeEvents }) => {
      await stripeEvents.pruneProcessedBefore(
        cutoff,
        STRIPE_EVENTS_PRUNE_LIMIT,
      );
    });
  } catch (error) {
    deps.logger.warn(
      {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Stripe event pruning failed',
    );
  }
}
