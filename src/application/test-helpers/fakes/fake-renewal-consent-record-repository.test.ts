import { describe, expect, it } from 'vitest';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import { FakeRenewalConsentRecordRepository } from './fake-renewal-consent-record-repository';

function createConsent(
  overrides: Partial<Parameters<typeof newRenewalConsentRecord>[0]> = {},
) {
  return newRenewalConsentRecord({
    userId: 'user_1',
    consumerReference:
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    checkoutSessionId: 'cs_123',
    setupSessionId: null,
    plan: 'monthly',
    amountCents: 2900,
    currency: 'usd',
    frequency: 'month',
    trialEndsAt: new Date('2026-08-13T12:00:00Z'),
    cancellationDeadline: new Date('2026-08-13T12:00:00Z'),
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
    disclosureSnapshot: 'Exact disclosure.',
    disclosureVersion: '2026-08-05',
    termsVersion: '2026-08-05',
    termsHash:
      'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
    consentSource: 'stripe_checkout',
    acceptedAt: new Date('2026-08-06T12:00:00Z'),
    consentKind: 'initial_offer',
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
    ...overrides,
  });
}

describe('FakeRenewalConsentRecordRepository', () => {
  it('replays the same source evidence without creating a duplicate', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const first = await repository.save(createConsent());
    const replay = await repository.save(createConsent());

    expect(replay.id).toBe(first.id);
    expect(repository.snapshot()).toHaveLength(1);
  });

  it('rejects a source replay attributed to another user', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    await repository.save(createConsent());

    await expect(
      repository.save(createConsent({ userId: 'user_2' })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('preserves the exact disclosure and consent timestamps', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const saved = await repository.save(createConsent());

    expect(saved).toMatchObject({
      disclosureSnapshot: 'Exact disclosure.',
      acceptedAt: new Date('2026-08-06T12:00:00Z'),
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      cancellationDeadline: new Date('2026-08-13T12:00:00Z'),
    });
  });

  it('retains a record while clearing its deleted user reference', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const saved = await repository.save(createConsent());

    repository.clearUserReference('user_1');

    await expect(repository.findById(saved.id)).resolves.toMatchObject({
      userId: null,
      consumerReference:
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    });
  });

  it('prunes only terminated records whose full retention period elapsed', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const due = await repository.save(createConsent());
    await repository.save(
      createConsent({
        checkoutSessionId: 'cs_active',
        stripeSubscriptionId: 'sub_active',
      }),
    );
    await repository.markSubscriptionTerminated({
      stripeSubscriptionId: due.stripeSubscriptionId,
      terminatedAt: new Date('2027-01-01T00:00:00Z'),
    });

    await expect(
      repository.pruneExpired({
        before: new Date('2029-08-06T12:00:01Z'),
        limit: 100,
      }),
    ).resolves.toBe(1);
    expect(repository.snapshot()).toHaveLength(1);
    expect(repository.snapshot()[0]?.stripeSubscriptionId).toBe('sub_active');
  });

  it('does not shorten retention for an out-of-order termination replay', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const saved = await repository.save(createConsent());
    await repository.markSubscriptionTerminated({
      stripeSubscriptionId: saved.stripeSubscriptionId,
      terminatedAt: new Date('2030-02-01T00:00:00Z'),
    });

    await repository.markSubscriptionTerminated({
      stripeSubscriptionId: saved.stripeSubscriptionId,
      terminatedAt: new Date('2027-01-01T00:00:00Z'),
    });

    await expect(repository.findById(saved.id)).resolves.toMatchObject({
      subscriptionTerminatedAt: new Date('2030-02-01T00:00:00Z'),
      retainUntil: new Date('2031-02-01T00:00:00Z'),
    });
  });
});
