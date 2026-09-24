import type { WebhookEventResult } from '@/src/application/ports/gateways';
import { createTestRenewalTerms } from './renewal-terms';

type SubscriptionUpdate = NonNullable<WebhookEventResult['subscriptionUpdate']>;
type InitialSubscriptionConsent = NonNullable<
  WebhookEventResult['initialSubscriptionConsent']
>;
type TrialSetupCompletion = NonNullable<
  WebhookEventResult['trialPaymentMethodSetupCompletion']
>;
type TrialSetupExpiration = NonNullable<
  WebhookEventResult['trialPaymentMethodSetupExpiration']
>;

// Builders for the normalized webhook DTO the payment gateway hands the
// controller. The caller always supplies the application-owned `userId` (and
// the Session id) so each case links its seeded rows to the event explicitly;
// provider ids default to readable placeholders, and the renewal terms come
// from createTestRenewalTerms so a seeded setup operation and its accepted
// snapshot agree unless a case overrides one of them.

export function createTestWebhookSubscriptionUpdate(
  input: Pick<SubscriptionUpdate, 'userId'> & Partial<SubscriptionUpdate>,
): SubscriptionUpdate {
  return {
    externalCustomerId: 'cus_123',
    externalSubscriptionId: 'sub_123',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    ...input,
  };
}

export function createTestWebhookInitialSubscriptionConsent(
  input: Pick<InitialSubscriptionConsent, 'userId' | 'checkoutSessionId'> &
    Partial<InitialSubscriptionConsent>,
): InitialSubscriptionConsent {
  return {
    ...createTestRenewalTerms('monthly'),
    externalCustomerId: 'cus_123',
    externalSubscriptionId: 'sub_123',
    acceptedAt: new Date('2026-08-06T12:00:00Z'),
    ...input,
  };
}

function trialSetupTerms() {
  const {
    plan,
    amountCents,
    currency,
    frequency,
    disclosureVersion,
    termsVersion,
    termsHash,
  } = createTestRenewalTerms('monthly', true);
  return {
    plan,
    amountCents,
    currency,
    frequency,
    disclosureVersion,
    termsVersion,
    termsHash,
  };
}

export function createTestWebhookTrialSetupCompletion(
  input: Pick<TrialSetupCompletion, 'userId' | 'sessionId'> &
    Partial<TrialSetupCompletion>,
): TrialSetupCompletion {
  return {
    ...trialSetupTerms(),
    externalCustomerId: 'cus_123',
    externalSubscriptionId: 'sub_123',
    trialEndsAt: new Date('2026-08-13T12:00:00Z'),
    stripePaymentMethodId: 'pm_123',
    acceptedAt: new Date('2026-08-06T12:00:00Z'),
    ...input,
  };
}

export function createTestWebhookTrialSetupExpiration(
  input: Pick<TrialSetupExpiration, 'userId' | 'sessionId'> &
    Partial<TrialSetupExpiration>,
): TrialSetupExpiration {
  return {
    ...trialSetupTerms(),
    externalCustomerId: 'cus_123',
    externalSubscriptionId: 'sub_123',
    trialEndsAt: new Date('2026-08-13T12:00:00Z'),
    expiredAt: new Date('2026-08-07T12:00:00Z'),
    ...input,
  };
}
