import { NextResponse } from 'next/server';
import type {
  ClerkWebhookDeps,
  ClerkWebhookEvent,
} from '@/src/adapters/controllers/clerk-webhook-controller';
import type {
  StripeCustomerRepository,
  UserRepository,
} from '@/src/application/ports/repositories';

type StripeClient = {
  subscriptions: {
    list: (params: {
      customer: string;
      status: 'all';
      limit?: number;
    }) => AsyncIterable<{ id: string; status: string }>;
    cancel: (subscriptionId: string) => Promise<unknown>;
  };
};

type ClerkWebhookRouteLogger = {
  error: (context: unknown, message: string) => void;
};

export type ClerkWebhookRouteContainer = {
  logger: ClerkWebhookRouteLogger;
  stripe: StripeClient;
  createUserRepository: () => UserRepository;
  createStripeCustomerRepository: () => StripeCustomerRepository;
};

type VerifyWebhookFn = (req: Request) => Promise<ClerkWebhookEvent>;
type CancelStripeCustomerSubscriptionsFn = (
  stripe: StripeClient,
  stripeCustomerId: string,
) => Promise<void>;

export function createWebhookHandler(
  createContainer: () => ClerkWebhookRouteContainer,
  verifyWebhook: VerifyWebhookFn,
  processClerkWebhook: (
    deps: ClerkWebhookDeps,
    event: ClerkWebhookEvent,
  ) => Promise<void>,
  cancelStripeCustomerSubscriptions: CancelStripeCustomerSubscriptionsFn,
) {
  return async function POST(req: Request) {
    const container = createContainer();

    let event: ClerkWebhookEvent;
    try {
      event = await verifyWebhook(req);
    } catch (_error) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 400 },
      );
    }

    try {
      await processClerkWebhook(
        {
          userRepository: container.createUserRepository(),
          stripeCustomerRepository: container.createStripeCustomerRepository(),
          cancelStripeCustomerSubscriptions:
            cancelStripeCustomerSubscriptions.bind(null, container.stripe),
        },
        event,
      );

      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      container.logger.error({ error }, 'Clerk webhook failed');
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 },
      );
    }
  };
}
