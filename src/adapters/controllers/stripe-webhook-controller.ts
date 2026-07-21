import { STACK_TRACE_LIMIT } from '@/src/adapters/shared/error-logging-constants';
import {
  isE2EOwnerMismatchEvent,
  isMissingStripeSubscriptionUserIdError,
} from '@/src/adapters/shared/stripe-subscription-errors';
import {
  ApplicationError,
  isApplicationError,
  isSubscriptionUserMissingError,
} from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import { persistSubscriptionObservation } from '@/src/application/shared/persist-subscription-observation';
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
  subscriptionVersions: Pick<
    SubscriptionRepository,
    'findObservationVersionByUserId'
  >;
  transaction: <T>(
    fn: (tx: StripeWebhookTransaction) => Promise<T>,
  ) => Promise<T>;
  logger: Logger;
  now: () => Date;
};

type StripeWebhookEvent = Awaited<
  ReturnType<PaymentGateway['processWebhookEvent']>
>;
type StripeSubscriptionUpdate = NonNullable<
  StripeWebhookEvent['subscriptionUpdate']
>;

class StripeWebhookAlreadyProcessed extends Error {}

const STRIPE_EVENTS_RETENTION_MS = 90 * DAY_MS;
const STRIPE_EVENTS_PRUNE_LIMIT = 100;

function isSuccessfullyProcessed(event: {
  processedAt: Date | null;
  error: string | null;
}): boolean {
  return event.processedAt !== null && event.error === null;
}

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

      if (isSuccessfullyProcessed(current)) {
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

async function persistAcknowledgedOutcome(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
): Promise<void> {
  await deps.transaction(async ({ stripeEvents }) => {
    await stripeEvents.claim(event.eventId, event.type);
    const current = await stripeEvents.lock(event.eventId);

    if (isSuccessfullyProcessed(current)) {
      return;
    }

    await stripeEvents.markProcessed(event.eventId);
  });
}

async function processSubscriptionWebhook(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
  event: StripeWebhookEvent,
  subscriptionUpdate: StripeSubscriptionUpdate,
): Promise<void> {
  let processingError: unknown;
  let hasProcessingError = false;
  const discoveredUserId = subscriptionUpdate.userId;
  const retrieveSubscriptionUpdate =
    async (): Promise<StripeSubscriptionUpdate> => {
      const refreshedEvent = await deps.paymentGateway.processWebhookEvent(
        input.rawBody,
        input.signature,
      );
      if (
        refreshedEvent.eventId !== event.eventId ||
        refreshedEvent.type !== event.type ||
        !refreshedEvent.subscriptionUpdate
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'Stripe webhook changed during subscription refresh',
        );
      }
      return refreshedEvent.subscriptionUpdate;
    };

  try {
    await persistSubscriptionObservation({
      userId: discoveredUserId,
      readVersion: (userId) =>
        deps.subscriptionVersions.findObservationVersionByUserId(userId),
      retrieve: retrieveSubscriptionUpdate,
      getUserId: (nextSubscriptionUpdate) => nextSubscriptionUpdate.userId,
      persist: (nextSubscriptionUpdate, expectedVersion) =>
        deps.transaction(
          async ({ stripeEvents, subscriptions, stripeCustomers }) => {
            const claimed = await stripeEvents.claim(event.eventId, event.type);
            if (!claimed) {
              const snapshot = await stripeEvents.peek(event.eventId);
              if (snapshot && isSuccessfullyProcessed(snapshot)) {
                throw new StripeWebhookAlreadyProcessed();
              }
            }

            const current = await stripeEvents.lock(event.eventId);
            if (isSuccessfullyProcessed(current)) {
              throw new StripeWebhookAlreadyProcessed();
            }

            try {
              // Stripe webhook, checkout-success, and reconcile use advisory(user)
              // -> stripe_subscriptions -> stripe_customers. User deletion is the
              // fourth writer and takes the same advisory before its inverse cascade.
              const write = await subscriptions.upsert({
                userId: nextSubscriptionUpdate.userId,
                externalSubscriptionId:
                  nextSubscriptionUpdate.externalSubscriptionId,
                plan: nextSubscriptionUpdate.plan,
                status: nextSubscriptionUpdate.status,
                currentPeriodEnd: nextSubscriptionUpdate.currentPeriodEnd,
                cancelAtPeriodEnd: nextSubscriptionUpdate.cancelAtPeriodEnd,
                expectedVersion,
              });
              if (!write.persisted && write.reason === 'version_conflict') {
                return write;
              }

              if (write.persisted) {
                await stripeCustomers.insert(
                  nextSubscriptionUpdate.userId,
                  nextSubscriptionUpdate.externalCustomerId,
                  { conflictStrategy: 'authoritative' },
                );
              }

              await stripeEvents.markProcessed(event.eventId);
              return write;
            } catch (error) {
              if (error instanceof StripeWebhookAlreadyProcessed) {
                throw error;
              }
              processingError = error;
              hasProcessingError = true;
              throw error;
            }
          },
        ),
    });
  } catch (transactionError) {
    if (transactionError instanceof StripeWebhookAlreadyProcessed) {
      // Another delivery committed this event first.
      return;
    }

    if (isSubscriptionUserMissingError(transactionError)) {
      await persistAcknowledgedOutcome(deps, event);
      deps.logger.warn(
        {
          reason: 'user_missing',
          eventId: event.eventId,
          eventType: event.type,
          stripeCustomerId: subscriptionUpdate.externalCustomerId,
          userId: transactionError.userId,
        },
        'Acknowledging Stripe subscription webhook for missing local user',
      );
      return;
    }

    throw hasProcessingError ? processingError : transactionError;
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
    if (event.subscriptionUpdate) {
      await processSubscriptionWebhook(
        deps,
        input,
        event,
        event.subscriptionUpdate,
      );
    } else {
      await deps.transaction(async ({ stripeEvents }) => {
        const claimed = await stripeEvents.claim(event.eventId, event.type);
        if (!claimed) {
          const snapshot = await stripeEvents.peek(event.eventId);
          if (snapshot && isSuccessfullyProcessed(snapshot)) {
            return;
          }
        }

        const current = await stripeEvents.lock(event.eventId);
        if (isSuccessfullyProcessed(current)) {
          return;
        }

        try {
          await stripeEvents.markProcessed(event.eventId);
        } catch (error) {
          processingError = error;
          hasProcessingError = true;
          throw error;
        }
      });
    }
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
