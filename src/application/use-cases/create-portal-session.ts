import { ApplicationError } from '../errors';
import type {
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
} from '../ports/billing';
import type { PaymentGateway } from '../ports/gateways';
import type { StripeCustomerRepository } from '../ports/repositories';

export type { CreatePortalSessionInput, CreatePortalSessionOutput };

export class CreatePortalSessionUseCase {
  constructor(
    private readonly stripeCustomers: StripeCustomerRepository,
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

    const portalSessionInput = {
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      returnUrl: input.returnUrl,
    };

    if (input.idempotencyKey) {
      return this.payments.createPortalSession(portalSessionInput, {
        idempotencyKey: input.idempotencyKey,
      });
    }

    return this.payments.createPortalSession(portalSessionInput);
  }
}
