import { describe, expect, it } from 'vitest';
import { FakePaymentGateway } from './fake-gateways';

describe('FakePaymentGateway', () => {
  it('returns configured checkout/portal URLs and records inputs', async () => {
    const gateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://fake/checkout',
      portalUrl: 'https://fake/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    await expect(
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_test' });

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://fake/checkout' });

    await expect(
      gateway.createPortalSession({
        externalCustomerId: 'cus_123',
        returnUrl: 'https://app/return',
      }),
    ).resolves.toEqual({ url: 'https://fake/portal' });

    await expect(gateway.processWebhookEvent('raw', 'sig')).resolves.toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });

    expect(gateway.customerInputs).toHaveLength(1);
    expect(gateway.checkoutInputs).toHaveLength(1);
    expect(gateway.portalInputs).toHaveLength(1);
    expect(gateway.webhookInputs).toEqual([
      { rawBody: 'raw', signature: 'sig' },
    ]);
  });
});
