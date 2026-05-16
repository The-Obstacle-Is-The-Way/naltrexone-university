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

type StripeWebhookTxResult = { ok: true } | { ok: false; error: unknown };

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

export async function processStripeWebhook(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
): Promise<void> {
  let event: Awaited<ReturnType<PaymentGateway['processWebhookEvent']>>;
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

  const txResult = await deps.transaction(
    async ({
      stripeEvents,
      subscriptions,
      stripeCustomers,
    }): Promise<StripeWebhookTxResult> => {
      const claimed = await stripeEvents.claim(event.eventId, event.type);
      if (!claimed) {
        const snapshot = await stripeEvents.peek(event.eventId);
        if (
          snapshot &&
          snapshot.processedAt !== null &&
          snapshot.error === null
        ) {
          return { ok: true };
        }
      }

      const current = await stripeEvents.lock(event.eventId);
      if (current.processedAt !== null && current.error === null) {
        return { ok: true };
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
        return { ok: true };
      } catch (error) {
        await stripeEvents.markFailed(event.eventId, toErrorData(error));
        return { ok: false, error };
      }
    },
  );

  if (!txResult.ok) {
    throw txResult.error;
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
