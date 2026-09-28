import { ApplicationError } from '../errors';
import type {
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
} from '../ports/billing';
import type { PaymentGateway, PortalProfile } from '../ports/gateways';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '../ports/repositories';

export type { CreatePortalSessionInput, CreatePortalSessionOutput };

export class CreatePortalSessionUseCase {
  constructor(
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(
    input: CreatePortalSessionInput,
  ): Promise<CreatePortalSessionOutput> {
    const stripeCustomer = await this.stripeCustomers.findByUserId(
      input.userId,
    );
    if (!stripeCustomer) {
      throw new ApplicationError('NOT_FOUND', 'Stripe customer not found');
    }

    // A trial, or a subscription not yet recorded, fails closed to the
    // trial profile.
    const subscription = await this.subscriptions.findByUserId(input.userId);
    const profile: PortalProfile =
      subscription === null || subscription.status === 'inTrial'
        ? 'trial'
        : 'paid';

    const portalSessionInput = {
      externalCustomerId: stripeCustomer.stripeCustomerId,
      returnUrl: input.returnUrl,
      profile,
    };

    if (input.idempotencyKey) {
      return this.payments.createPortalSession(portalSessionInput, {
        idempotencyKey: input.idempotencyKey,
      });
    }

    return this.payments.createPortalSession(portalSessionInput);
  }
}
