import { describe, expect, it } from 'vitest';
import { DomainError } from '@/src/domain/errors';
import {
  newRenewalConsentRecord,
  terminateRenewalConsentRecord,
} from '../entities/renewal-consent-record';
import {
  AllRenewalConsentKinds,
  AllRenewalConsentSources,
  computeRenewalConsentRetainUntil,
} from './renewal-consent';

const acceptedAt = new Date('2026-08-06T12:00:00Z');

function createInitialOfferInput() {
  return {
    userId: 'user_123',
    consumerReference:
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    checkoutSessionId: 'cs_123',
    setupSessionId: null,
    plan: 'monthly' as const,
    amountCents: 2900,
    currency: 'usd' as const,
    frequency: 'month' as const,
    trialEndsAt: new Date('2026-08-13T12:00:00Z'),
    cancellationDeadline: new Date('2026-08-13T12:00:00Z'),
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
    disclosureSnapshot: 'Exact renewal disclosure.',
    disclosureVersion: '2026-08-05',
    termsVersion: '2026-08-05',
    termsHash:
      'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
    consentSource: 'stripe_checkout' as const,
    acceptedAt,
    consentKind: 'initial_offer' as const,
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
  };
}

describe('renewal consent', () => {
  it('enumerates the only supported kinds and sources', () => {
    expect(AllRenewalConsentKinds).toEqual(['initial_offer', 'price_increase']);
    expect(AllRenewalConsentSources).toEqual([
      'stripe_checkout',
      'stripe_setup',
      'application',
    ]);
  });

  it('creates an initial-offer record with a three-year retention floor', () => {
    const record = newRenewalConsentRecord(createInitialOfferInput());

    expect(record).toMatchObject({
      consentKind: 'initial_offer',
      subscriptionTerminatedAt: null,
      retainUntil: new Date('2029-08-06T12:00:00Z'),
    });
  });

  it('requires all subscriber-specific terms for price-increase consent', () => {
    expect(() =>
      newRenewalConsentRecord({
        ...createInitialOfferInput(),
        consentKind: 'price_increase',
        priorAmountCents: 2900,
        proposedAmountCents: null,
        effectiveRenewalAt: new Date('2027-01-01T00:00:00Z'),
      }),
    ).toThrow(DomainError);
  });

  it('rejects price-increase fields on an initial offer', () => {
    expect(() =>
      newRenewalConsentRecord({
        ...createInitialOfferInput(),
        proposedAmountCents: 3900,
      }),
    ).toThrow(DomainError);
  });

  it('requires one source Session matching the consent source', () => {
    expect(() =>
      newRenewalConsentRecord({
        ...createInitialOfferInput(),
        checkoutSessionId: null,
      }),
    ).toThrow(DomainError);
    expect(() =>
      newRenewalConsentRecord({
        ...createInitialOfferInput(),
        setupSessionId: 'cs_setup_123',
      }),
    ).toThrow(DomainError);
  });

  it('supports application consent without a Stripe Session reference', () => {
    expect(
      newRenewalConsentRecord({
        ...createInitialOfferInput(),
        checkoutSessionId: null,
        consentSource: 'application',
        consentKind: 'price_increase',
        priorAmountCents: 2900,
        proposedAmountCents: 3900,
        effectiveRenewalAt: new Date('2027-01-01T00:00:00Z'),
      }),
    ).toMatchObject({
      checkoutSessionId: null,
      setupSessionId: null,
      consentSource: 'application',
    });
  });

  it('rejects a Stripe Session reference on application consent', () => {
    expect(() =>
      newRenewalConsentRecord({
        ...createInitialOfferInput(),
        consentSource: 'application',
      }),
    ).toThrow(DomainError);
  });

  it('extends retention to one year after a later contract termination', () => {
    const record = newRenewalConsentRecord(createInitialOfferInput());
    const terminated = terminateRenewalConsentRecord(
      record,
      new Date('2030-02-01T00:00:00Z'),
    );

    expect(terminated.subscriptionTerminatedAt).toEqual(
      new Date('2030-02-01T00:00:00Z'),
    );
    expect(terminated.retainUntil).toEqual(new Date('2031-02-01T00:00:00Z'));
  });

  it('keeps the three-year floor when termination occurs earlier', () => {
    expect(
      computeRenewalConsentRetainUntil(
        acceptedAt,
        new Date('2027-01-01T00:00:00Z'),
      ),
    ).toEqual(new Date('2029-08-06T12:00:00Z'));
  });

  it('does not shorten retention when an older termination is replayed', () => {
    const record = terminateRenewalConsentRecord(
      newRenewalConsentRecord(createInitialOfferInput()),
      new Date('2030-02-01T00:00:00Z'),
    );

    const replayed = terminateRenewalConsentRecord(
      record,
      new Date('2027-01-01T00:00:00Z'),
    );

    expect(replayed.subscriptionTerminatedAt).toEqual(
      new Date('2030-02-01T00:00:00Z'),
    );
    expect(replayed.retainUntil).toEqual(new Date('2031-02-01T00:00:00Z'));
  });
});
