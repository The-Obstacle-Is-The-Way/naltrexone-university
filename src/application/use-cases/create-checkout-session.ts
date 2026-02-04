import { ApplicationError } from '../errors';
import type { PaymentGateway } from '../ports/gateways';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '../ports/repositories';

export type CreateCheckoutSessionInput = {
  userId: string;
  clerkUserId: string | null;
  email: string;
  plan: 'monthly' | 'annual';
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
};

export type CreateCheckoutSessionOutput = { url: string };

export class CreateCheckoutSessionUseCase {
  constructor(
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly payments: PaymentGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async getOrCreateStripeCustomerId(input: {
    userId: string;
    clerkUserId: string | null;
    email: string;
  }): Promise<string> {
    const existing = await this.stripeCustomers.findByUserId(input.userId);
    if (existing) return existing.stripeCustomerId;

    if (!input.clerkUserId) {
      throw new ApplicationError('INTERNAL_ERROR', 'Clerk user id is required');
    }

    const created = await this.payments.createCustomer(
      {
        userId: input.userId,
        clerkUserId: input.clerkUserId,
        email: input.email,
      },
      { idempotencyKey: `stripe_customer:${input.userId}` },
    );

    await this.stripeCustomers.insert(input.userId, created.stripeCustomerId);
    return created.stripeCustomerId;
  }

  async execute(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    if (subscription && subscription.currentPeriodEnd > this.now()) {
      throw new ApplicationError(
        'ALREADY_SUBSCRIBED',
        'Subscription already exists for this user',
      );
    }

    const stripeCustomerId = await this.getOrCreateStripeCustomerId({
      userId: input.userId,
      clerkUserId: input.clerkUserId,
      email: input.email,
    });

    const checkoutSessionInput = {
      userId: input.userId,
      stripeCustomerId,
      plan: input.plan,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    };

    if (input.idempotencyKey) {
      return this.payments.createCheckoutSession(checkoutSessionInput, {
        idempotencyKey: input.idempotencyKey,
      });
    }

    return this.payments.createCheckoutSession(checkoutSessionInput);
  }
}
