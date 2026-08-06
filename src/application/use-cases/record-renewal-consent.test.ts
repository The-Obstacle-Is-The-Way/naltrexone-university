import { describe, expect, it } from 'vitest';
import { FakeRenewalConsentRecordRepository } from '@/src/application/test-helpers/fakes';
import { RecordRenewalConsentUseCase } from './record-renewal-consent';

const input = {
  userId: 'user_1',
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
  cancellationMethod: 'Billing page in the app or support@addictionboards.com',
  disclosureSnapshot: 'Exact disclosure.',
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
  consentSource: 'stripe_checkout' as const,
  acceptedAt: new Date('2026-08-06T12:00:00Z'),
  consentKind: 'initial_offer' as const,
  priorAmountCents: null,
  proposedAmountCents: null,
  effectiveRenewalAt: null,
};

describe('RecordRenewalConsentUseCase', () => {
  it('persists the exact accepted evidence and computed retention floor', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const useCase = new RecordRenewalConsentUseCase(repository);

    await expect(useCase.execute(input)).resolves.toMatchObject({
      ...input,
      retainUntil: new Date('2029-08-06T12:00:00Z'),
      subscriptionTerminatedAt: null,
    });
  });

  it('is idempotent for replay of the same Checkout Session', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const useCase = new RecordRenewalConsentUseCase(repository);

    const first = await useCase.execute(input);
    const replay = await useCase.execute(input);

    expect(replay.id).toBe(first.id);
    expect(repository.snapshot()).toHaveLength(1);
  });

  it('rejects cross-user reuse of a consent source', async () => {
    const repository = new FakeRenewalConsentRecordRepository();
    const useCase = new RecordRenewalConsentUseCase(repository);
    await useCase.execute(input);

    await expect(
      useCase.execute({ ...input, userId: 'user_2' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
