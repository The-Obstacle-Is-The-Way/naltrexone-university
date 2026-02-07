import { isApplicationError } from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
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
};

const STACK_TRACE_LIMIT = 1000;
const STRIPE_EVENTS_RETENTION_MS = 90 * 86_400_000;
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

  // Best-effort cleanup: prune old stripe events.
  // Idempotency keys and rate limits are pruned in their own hot paths
  // (withIdempotency and DrizzleRateLimiter.limit respectively).
  const cutoff = new Date(Date.now() - STRIPE_EVENTS_RETENTION_MS);

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
