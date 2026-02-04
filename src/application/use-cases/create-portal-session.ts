import { ApplicationError } from '../errors';
import type { PaymentGateway } from '../ports/gateways';
import type { StripeCustomerRepository } from '../ports/repositories';

export type CreatePortalSessionInput = {
  userId: string;
  returnUrl: string;
  idempotencyKey?: string;
};

export type CreatePortalSessionOutput = { url: string };

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

    return this.payments.createPortalSession({
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      returnUrl: input.returnUrl,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
  }
}
