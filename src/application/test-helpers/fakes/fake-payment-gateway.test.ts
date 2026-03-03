import { describe, expect, it } from 'vitest';
import { FakePaymentGateway } from './fake-gateways';

function createGateway(): FakePaymentGateway {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_test',
    checkoutUrl: 'https://fake/checkout',
    portalUrl: 'https://fake/portal',
    webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
  });
}

describe('FakePaymentGateway', () => {
  describe('createCustomer', () => {
    it('returns configured externalCustomerId and records input', async () => {
      const gateway = createGateway();
      const input = {
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      };

      await expect(gateway.createCustomer(input)).resolves.toEqual({
        externalCustomerId: 'cus_test',
      });
      expect(gateway.customerInputs).toEqual([input]);
    });
  });

  describe('createCheckoutSession', () => {
    it('returns configured checkout URL and records input', async () => {
      const gateway = createGateway();
      const input = {
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly' as const,
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      };

      await expect(gateway.createCheckoutSession(input)).resolves.toEqual({
        url: 'https://fake/checkout',
      });
      expect(gateway.checkoutInputs).toEqual([input]);
    });
  });

  describe('createPortalSession', () => {
    it('returns configured portal URL and records input', async () => {
      const gateway = createGateway();
      const input = {
        externalCustomerId: 'cus_123',
        returnUrl: 'https://app/return',
      };

      await expect(gateway.createPortalSession(input)).resolves.toEqual({
        url: 'https://fake/portal',
      });
      expect(gateway.portalInputs).toEqual([input]);
    });
  });

  describe('processWebhookEvent', () => {
    it('returns configured webhook result and records raw body/signature', async () => {
      const gateway = createGateway();

      await expect(gateway.processWebhookEvent('raw', 'sig')).resolves.toEqual({
        eventId: 'evt_1',
        type: 'checkout.session.completed',
      });
      expect(gateway.webhookInputs).toEqual([
        { rawBody: 'raw', signature: 'sig' },
      ]);
    });
  });
});
