import { describe, expect, it } from 'vitest';
import { parseTransactionalEmailPayloadSnapshot } from '@/src/application/shared/transactional-email-payload';
import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
} from '@/src/application/test-helpers/fakes';
import type { RenewalConsentRecord } from '@/src/domain/entities';
import { SendRenewalAcknowledgmentUseCase } from './send-renewal-acknowledgment';

const now = new Date('2026-08-07T12:00:00.000Z');
const consent: RenewalConsentRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  consumerReference:
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  externalCustomerId: 'cus_123',
  externalSubscriptionId: 'sub_123',
  checkoutSessionId: 'cs_123',
  setupSessionId: null,
  applicationSourceId: null,
  plan: 'monthly',
  amountCents: 2900,
  currency: 'usd',
  frequency: 'month',
  trialEndsAt: new Date('2026-08-14T12:00:00.000Z'),
  cancellationDeadline: new Date('2026-08-14T12:00:00.000Z'),
  cancellationMethod:
    'Cancel on the Billing page in the app or email support@addictionboards.com.',
  disclosureSnapshot: 'Your subscription renews monthly at $29 until canceled.',
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
  consentSource: 'stripe_checkout',
  acceptedAt: new Date('2026-08-07T11:55:00.000Z'),
  consentKind: 'initial_offer',
  priorAmountCents: null,
  proposedAmountCents: null,
  effectiveRenewalAt: null,
  subscriptionTerminatedAt: null,
  retainUntil: new Date('2029-08-07T11:55:00.000Z'),
  createdAt: now,
  updatedAt: now,
};

function createHarness() {
  const hasher = new FakeSha256Hasher();
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  let sequence = 0;
  const useCase = new SendRenewalAcknowledgmentUseCase(
    repository,
    hasher,
    'https://addictionboards.com',
    () => `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}`,
  );
  return { hasher, repository, useCase };
}

describe('SendRenewalAcknowledgmentUseCase', () => {
  it('queues immutable acknowledgment content for every accepted term', async () => {
    const { hasher, repository, useCase } = createHarness();

    const delivery = await useCase.execute({
      consent,
      destination: 'subscriber@example.com',
    });
    const payload = parseTransactionalEmailPayloadSnapshot(
      {
        snapshot: delivery.payloadSnapshot,
        hash: delivery.payloadHash,
        destination: delivery.destination,
      },
      hasher,
    );

    expect(delivery).toMatchObject({
      noticeKind: 'acknowledgment',
      consentRecordId: consent.id,
      externalSubscriptionId: null,
      applicableAt: null,
      disclosureVersion: consent.disclosureVersion,
      destination: 'subscriber@example.com',
      status: 'queued',
      attemptCount: 0,
    });
    expect(delivery.providerIdempotencyKey).toBe(
      `renewal-notice/${delivery.id}`,
    );
    expect(payload.to).toBe('subscriber@example.com');
    expect(payload.replyTo).toBe('support@addictionboards.com');
    expect(payload.text).toContain(consent.disclosureSnapshot);
    expect(payload.text).toContain('$29.00 USD every month');
    expect(payload.text).toContain('August 14, 2026');
    expect(payload.text).toContain(consent.cancellationMethod);
    expect(payload.text).toContain('John H. Jung, MD, MS');
    expect(payload.text).toContain('support@addictionboards.com');
    expect(payload.text).toContain('https://addictionboards.com/terms');
    expect(payload.text).toContain('https://addictionboards.com/privacy');
    expect(repository.records).toHaveLength(1);
  });

  it('reuses one acknowledgment row when the same consent is replayed', async () => {
    const { repository, useCase } = createHarness();

    const first = await useCase.execute({
      consent,
      destination: 'subscriber@example.com',
    });
    const replay = await useCase.execute({
      consent,
      destination: 'subscriber@example.com',
    });

    expect(replay).toEqual(first);
    expect(repository.records).toHaveLength(1);
  });

  it('rejects a missing destination before creating a delivery row', async () => {
    const { repository, useCase } = createHarness();

    await expect(
      useCase.execute({ consent, destination: '   ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.records).toEqual([]);
  });
});
