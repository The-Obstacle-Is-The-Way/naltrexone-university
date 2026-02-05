import { describe, expect, it } from 'vitest';
import { ApplicationError } from '../errors';
import {
  FakePaymentGateway,
  FakeStripeCustomerRepository,
} from '../test-helpers/fakes';
import { CreatePortalSessionUseCase } from './create-portal-session';

describe('CreatePortalSessionUseCase', () => {
  it('throws NOT_FOUND when the user has no Stripe customer mapping', async () => {
    const payments = new FakePaymentGateway({
      externalCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const useCase = new CreatePortalSessionUseCase(
      new FakeStripeCustomerRepository(),
      payments,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        returnUrl: 'https://app.example.com/app/billing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Stripe customer not found'),
    );
  });

  it('creates a portal session using the existing Stripe customer mapping', async () => {
    const payments = new FakePaymentGateway({
      externalCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert('user-1', 'cus_existing');

    const useCase = new CreatePortalSessionUseCase(stripeCustomers, payments);

    await expect(
      useCase.execute({
        userId: 'user-1',
        returnUrl: 'https://app.example.com/app/billing',
      }),
    ).resolves.toEqual({ url: 'https://stripe/portal' });

    expect(payments.portalInputs).toEqual([
      {
        externalCustomerId: 'cus_existing',
        returnUrl: 'https://app.example.com/app/billing',
      },
    ]);
  });
});
