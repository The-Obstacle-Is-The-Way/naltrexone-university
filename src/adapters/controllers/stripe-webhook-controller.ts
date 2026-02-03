import { isApplicationError } from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';
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
};

const STACK_TRACE_LIMIT = 1000;
const DAY_MS = 86_400_000;
const STRIPE_EVENT_RETENTION_DAYS = 90;
const STRIPE_EVENT_PRUNE_LIMIT = 100;

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
      await stripeEvents.claim(event.eventId, event.type);

      const current = await stripeEvents.lock(event.eventId);
      if (current.processedAt !== null && current.error === null) {
        return;
      }

      try {
        if (event.subscriptionUpdate) {
          await stripeCustomers.insert(
            event.subscriptionUpdate.userId,
            event.subscriptionUpdate.stripeCustomerId,
          );

          await subscriptions.upsert({
            userId: event.subscriptionUpdate.userId,
            stripeSubscriptionId: event.subscriptionUpdate.stripeSubscriptionId,
            plan: event.subscriptionUpdate.plan,
            status: event.subscriptionUpdate.status,
            currentPeriodEnd: event.subscriptionUpdate.currentPeriodEnd,
            cancelAtPeriodEnd: event.subscriptionUpdate.cancelAtPeriodEnd,
          });
        }

        await stripeEvents.markProcessed(event.eventId);

        try {
          await stripeEvents.pruneProcessedBefore(
            new Date(Date.now() - STRIPE_EVENT_RETENTION_DAYS * DAY_MS),
            STRIPE_EVENT_PRUNE_LIMIT,
          );
        } catch {
          // Best-effort cleanup: do not fail webhook processing if pruning fails.
        }
      } catch (error) {
        await stripeEvents.markFailed(event.eventId, toErrorData(error));
        throw error;
      }
    },
  );
}
