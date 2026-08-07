import { describe, expect, it } from 'vitest';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import { FakeRenewalNoticeDeliveryRepository } from '@/src/application/test-helpers/fakes';
import type { RenewalNoticeDeliveryStatus } from '@/src/domain/entities';
import { RequeueRenewalNoticeDeliveryUseCase } from './requeue-renewal-notice-delivery';

const now = new Date('2026-08-06T18:00:00.000Z');
const deliveryId = '11111111-1111-4111-8111-111111111111';

async function createRepository(status: RenewalNoticeDeliveryStatus) {
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
  const payload = createTransactionalEmailPayloadSnapshot({
    from: 'Addiction Boards <notices@addictionboards.com>',
    to: 'subscriber@example.com',
    replyTo: 'support@addictionboards.com',
    subject: 'Your renewal terms',
    html: '<p>Renewal terms</p>',
    text: 'Renewal terms',
  });
  const saved = await repository.saveQueued({
    id: deliveryId,
    noticeKind: 'acknowledgment',
    consentRecordId: '22222222-2222-4222-8222-222222222222',
    externalSubscriptionId: null,
    applicableAt: null,
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
    payloadSnapshot: payload.snapshot,
    payloadHash: payload.hash,
  });
  repository.records[0] = {
    ...saved,
    status,
    failureClass: 'provider_outcome_unknown',
    failureCode: 'ETIMEDOUT',
  };
  return repository;
}

describe('RequeueRenewalNoticeDeliveryUseCase', () => {
  it('requeues an unknown outcome only with no-send confirmation and preserves an audit entry', async () => {
    const repository = await createRepository('outcome_unknown');
    const useCase = new RequeueRenewalNoticeDeliveryUseCase(
      repository,
      () => now,
    );

    await expect(
      useCase.execute({
        deliveryId,
        reason: 'Confirmed in Resend that no email exists',
        operator: 'operator@example.com',
        confirmedNoSend: true,
      }),
    ).resolves.toMatchObject({
      status: 'queued',
      requeueAudit: [
        {
          reason: 'Confirmed in Resend that no email exists',
          requeuedAt: now.toISOString(),
          requeuedBy: 'operator@example.com',
          confirmedNoSend: true,
          priorStatus: 'outcome_unknown',
        },
      ],
    });
  });

  it('normalizes operator evidence before persisting the audit entry', async () => {
    const repository = await createRepository('terminal_failure');
    const useCase = new RequeueRenewalNoticeDeliveryUseCase(
      repository,
      () => now,
    );

    await expect(
      useCase.execute({
        deliveryId,
        reason: '  Retry approved after provider review  ',
        operator: '  operator@example.com  ',
        confirmedNoSend: false,
      }),
    ).resolves.toMatchObject({
      requeueAudit: [
        {
          reason: 'Retry approved after provider review',
          requeuedBy: 'operator@example.com',
        },
      ],
    });
  });

  it('rejects an unknown outcome without no-send confirmation', async () => {
    const repository = await createRepository('outcome_unknown');
    const useCase = new RequeueRenewalNoticeDeliveryUseCase(repository);

    await expect(
      useCase.execute({
        deliveryId,
        reason: 'Retry requested',
        operator: 'operator@example.com',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.records[0]?.status).toBe('outcome_unknown');
    expect(repository.records[0]?.requeueAudit).toEqual([]);
  });

  it('rejects missing operator evidence and delivered rows', async () => {
    const repository = await createRepository('terminal_failure');
    const useCase = new RequeueRenewalNoticeDeliveryUseCase(repository);

    await expect(
      useCase.execute({
        deliveryId,
        reason: '   ',
        operator: 'operator@example.com',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({
        deliveryId,
        reason: 'Operator requested a retry',
        operator: '   ',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const existing = repository.records[0];
    if (!existing) throw new Error('Expected a delivery fixture');
    repository.records[0] = {
      ...existing,
      status: 'delivered',
    };
    await expect(
      useCase.execute({
        deliveryId,
        reason: 'Operator requested a retry',
        operator: 'operator@example.com',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
