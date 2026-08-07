import { describe, expect, it } from 'vitest';
import { createTestRenewalTerms } from '../renewal-terms';
import { FakePaymentGateway } from './fake-gateways';

function createGateway(): FakePaymentGateway {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_test',
    checkoutUrl: 'https://fake/checkout',
    trialSetupSessionId: 'cs_setup_test',
    trialSetupUrl: 'https://fake/trial-setup',
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
        ...createTestRenewalTerms('monthly'),
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      };

      await expect(gateway.createCheckoutSession(input)).resolves.toEqual({
        url: 'https://fake/checkout',
      });
      expect(gateway.checkoutInputs).toEqual([input]);
    });
  });

  describe('createTrialPaymentMethodSetupSession', () => {
    it('returns configured setup URL/session id and records input', async () => {
      const gateway = createGateway();
      const input = {
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly' as const,
        amountCents: 2900,
        currency: 'usd' as const,
        frequency: 'month' as const,
        trialEndsAt: new Date('2026-08-13T12:00:00Z'),
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        disclosureSnapshot: 'Exact disclosure.',
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      };

      await expect(
        gateway.createTrialPaymentMethodSetupSession(input),
      ).resolves.toEqual({
        sessionId: 'cs_setup_test',
        url: 'https://fake/trial-setup',
      });
      expect(gateway.trialSetupInputs).toEqual([input]);
    });

    it('uses a setup-specific fallback URL when none is configured', async () => {
      const gateway = new FakePaymentGateway({
        externalCustomerId: 'cus_test',
        checkoutUrl: 'https://fake/checkout',
        portalUrl: 'https://fake/portal',
        webhookResult: {
          eventId: 'evt_1',
          type: 'checkout.session.completed',
        },
      });

      await expect(
        gateway.createTrialPaymentMethodSetupSession({
          userId: 'user_1',
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          disclosureSnapshot: 'Exact disclosure.',
          cancellationMethod:
            'Billing page in the app or support@addictionboards.com',
          successUrl: 'https://app/success',
          cancelUrl: 'https://app/cancel',
        }),
      ).resolves.toMatchObject({ url: 'https://fake/trial-setup' });
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

  it('records each explicit trial payment-method write', async () => {
    const gateway = createGateway();
    const attachInput = {
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_123',
    };
    const defaultInput = {
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalSubscriptionId: 'sub_123',
    };

    await gateway.attachTrialPaymentMethod(attachInput);
    await gateway.setTrialSubscriptionDefaultPaymentMethod(defaultInput);

    expect(gateway.trialPaymentMethodAttachInputs).toEqual([attachInput]);
    expect(gateway.trialSubscriptionDefaultInputs).toEqual([defaultInput]);
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
