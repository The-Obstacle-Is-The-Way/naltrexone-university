import { describe, expect, it } from 'vitest';
import { FakeRenewalConsentRecordRepository } from '@/src/application/test-helpers/fakes';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import { PruneRenewalConsentsUseCase } from './prune-renewal-consents';

function createConsent(
  sessionId: string,
  subscriptionId: string,
  acceptedAt = new Date('2026-08-06T12:00:00Z'),
) {
  return newRenewalConsentRecord({
    userId: 'user_1',
    consumerReference:
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    externalCustomerId: 'cus_123',
    externalSubscriptionId: subscriptionId,
    checkoutSessionId: sessionId,
    setupSessionId: null,
    applicationSourceId: null,
    plan: 'monthly',
    amountCents: 2900,
    currency: 'usd',
    frequency: 'month',
    trialEndsAt: null,
    cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
    disclosureSnapshot: 'Exact disclosure.',
    disclosureVersion: '2026-08-05',
    termsVersion: '2026-08-05',
    termsHash:
      'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
    consentSource: 'stripe_checkout',
    acceptedAt,
    consentKind: 'initial_offer',
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
  });
}

describe('PruneRenewalConsentsUseCase', () => {
  it('prunes due terminated records in a bounded batch', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    await repository.save(createConsent('cs_due', 'sub_due'));
    await repository.markSubscriptionTerminated({
      externalSubscriptionId: 'sub_due',
      terminatedAt: new Date('2027-01-01T00:00:00Z'),
    });
    const useCase = new PruneRenewalConsentsUseCase(
      repository,
      () => new Date('2029-08-07T00:00:00Z'),
    );

    await expect(useCase.execute()).resolves.toBe(1);
  });

  it('does not prune an active record after its three-year floor', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    await repository.save(createConsent('cs_active', 'sub_active'));
    const useCase = new PruneRenewalConsentsUseCase(
      repository,
      () => new Date('2030-01-01T00:00:00Z'),
    );

    await expect(useCase.execute()).resolves.toBe(0);
    expect(repository.snapshot()).toHaveLength(1);
  });

  it('defaults to the real clock', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    await repository.save(
      createConsent('cs_old', 'sub_old', new Date('2020-01-01T00:00:00Z')),
    );
    await repository.markSubscriptionTerminated({
      externalSubscriptionId: 'sub_old',
      terminatedAt: new Date('2020-06-01T00:00:00Z'),
    });

    await expect(
      new PruneRenewalConsentsUseCase(repository).execute(),
    ).resolves.toBe(1);
  });
});
