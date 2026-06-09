import { isBlockingCheckoutSubscriptionStatus } from '@/src/domain/value-objects';
import { ApplicationError, isApplicationError } from '../errors';
import type { PaymentGateway } from '../ports/gateways';
import type { Logger } from '../ports/logger';
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

const FREE_TRIAL_DAYS = 7;
const STRIPE_CUSTOMER_IDEMPOTENCY_KEY_PREFIX = 'create_stripe_customer';

function toStripeCustomerIdempotencyKey(userId: string): string {
  return `${STRIPE_CUSTOMER_IDEMPOTENCY_KEY_PREFIX}:${userId}`;
}

export class CreateCheckoutSessionUseCase {
  constructor(
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly payments: PaymentGateway,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
    private readonly freeTrialEnabled = false,
  ) {}

  private warnOrphanedStripeCustomer(input: {
    userId: string;
    canonicalStripeCustomerId: string;
    orphanedStripeCustomerId: string;
  }): void {
    try {
      this.logger.warn(
        input,
        'Discarded orphaned Stripe customer created during concurrent mapping race',
      );
    } catch {
      // Logging must not change checkout behavior.
    }
  }

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
      { idempotencyKey: toStripeCustomerIdempotencyKey(input.userId) },
    );

    let conflictError: ApplicationError | null = null;

    try {
      await this.stripeCustomers.insert(
        input.userId,
        created.externalCustomerId,
      );
      return created.externalCustomerId;
    } catch (error) {
      if (!isApplicationError(error) || error.code !== 'CONFLICT') {
        throw error;
      }

      conflictError = error;
    }

    const winner = await this.stripeCustomers.findByUserId(input.userId);
    if (!winner) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Stripe customer mapping disappeared after conflict',
        undefined,
        conflictError ? { cause: conflictError } : undefined,
      );
    }

    this.warnOrphanedStripeCustomer({
      userId: input.userId,
      canonicalStripeCustomerId: winner.stripeCustomerId,
      orphanedStripeCustomerId: created.externalCustomerId,
    });

    return winner.stripeCustomerId;
  }

  async execute(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    if (
      subscription &&
      subscription.currentPeriodEnd > this.now() &&
      isBlockingCheckoutSubscriptionStatus(subscription.status)
    ) {
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

    const trialPeriodDays =
      this.freeTrialEnabled && subscription === null
        ? FREE_TRIAL_DAYS
        : undefined;

    const baseCheckoutSessionInput = {
      userId: input.userId,
      externalCustomerId: stripeCustomerId,
      plan: input.plan,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    };
    const checkoutSessionInput =
      trialPeriodDays === undefined
        ? baseCheckoutSessionInput
        : { ...baseCheckoutSessionInput, trialPeriodDays };

    if (input.idempotencyKey) {
      return this.payments.createCheckoutSession(checkoutSessionInput, {
        idempotencyKey: input.idempotencyKey,
      });
    }

    return this.payments.createCheckoutSession(checkoutSessionInput);
  }
}
