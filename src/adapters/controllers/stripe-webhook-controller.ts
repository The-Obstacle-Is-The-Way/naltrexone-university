import { isApplicationError } from '@/src/application/errors';
import type {
  PaymentGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  IdempotencyKeyRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';

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
  rateLimiter: RateLimiter;
  idempotencyKeys: IdempotencyKeyRepository;
};

const STACK_TRACE_LIMIT = 1000;
const DAY_MS = 86_400_000;
const PRUNE_RETENTION_DAYS = 90;
const PRUNE_BATCH_LIMIT = 100;

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

export async function processStripeWebhook(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
): Promise<void> {
  const event = await deps.paymentGateway.processWebhookEvent(
    input.rawBody,
    input.signature,
  );

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
          await stripeCustomers.insert(
            event.subscriptionUpdate.userId,
            event.subscriptionUpdate.externalCustomerId,
            { conflictStrategy: 'authoritative' },
          );

          await subscriptions.upsert({
            userId: event.subscriptionUpdate.userId,
            externalSubscriptionId:
              event.subscriptionUpdate.externalSubscriptionId,
            plan: event.subscriptionUpdate.plan,
            status: event.subscriptionUpdate.status,
            currentPeriodEnd: event.subscriptionUpdate.currentPeriodEnd,
            cancelAtPeriodEnd: event.subscriptionUpdate.cancelAtPeriodEnd,
          });
        }

        await stripeEvents.markProcessed(event.eventId);
      } catch (error) {
        await stripeEvents.markFailed(event.eventId, toErrorData(error));
        throw error;
      }
    },
  );

  const cutoff = new Date(Date.now() - PRUNE_RETENTION_DAYS * DAY_MS);

  // Best-effort cleanup: prune expired data from operational tables.
  // Failures do not affect webhook processing.

  try {
    await deps.transaction(async ({ stripeEvents }) => {
      await stripeEvents.pruneProcessedBefore(cutoff, PRUNE_BATCH_LIMIT);
    });
  } catch (error) {
    deps.logger.warn(
      {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
        retentionDays: PRUNE_RETENTION_DAYS,
        pruneLimit: PRUNE_BATCH_LIMIT,
      },
      'Stripe event pruning failed',
    );
  }

  try {
    await deps.idempotencyKeys.pruneExpiredBefore(cutoff, PRUNE_BATCH_LIMIT);
  } catch (error) {
    deps.logger.warn(
      {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
        retentionDays: PRUNE_RETENTION_DAYS,
        pruneLimit: PRUNE_BATCH_LIMIT,
      },
      'Idempotency key pruning failed',
    );
  }

  try {
    await deps.rateLimiter.pruneExpiredWindows(cutoff, PRUNE_BATCH_LIMIT);
  } catch (error) {
    deps.logger.warn(
      {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
        retentionDays: PRUNE_RETENTION_DAYS,
        pruneLimit: PRUNE_BATCH_LIMIT,
      },
      'Rate limit pruning failed',
    );
  }
}
