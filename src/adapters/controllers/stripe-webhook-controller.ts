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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
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
      } catch (error) {
        await stripeEvents.markFailed(event.eventId, toErrorMessage(error));
        throw error;
      }
    },
  );
}
