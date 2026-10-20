import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
} from '@/src/application/test-helpers/fakes';
import type { RenewalNoticeDeliveryStatus } from '@/src/domain/entities';
import { RequeueRenewalNoticeDeliveryUseCase } from './requeue-renewal-notice-delivery';

const now = new Date('2026-08-06T18:00:00.000Z');
const deliveryId = '11111111-1111-4111-8111-111111111111';
const hasher = new FakeSha256Hasher();

async function createRepository(status: RenewalNoticeDeliveryStatus) {
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
  const payload = createTransactionalEmailPayloadSnapshot(
    {
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: 'subscriber@example.com',
      replyTo: 'support@addictionboards.com',
      subject: 'Your renewal terms',
      html: '<p>Renewal terms</p>',
      text: 'Renewal terms',
    },
    hasher,
  );
  await repository.saveQueued({
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
  await repository.claim({
    id: deliveryId,
    attemptId: 'attempt-1',
    startedAt: now,
  });
  const failure = {
    id: deliveryId,
    attemptId: 'attempt-1',
    failureClass: 'provider_outcome_unknown',
    failureCode: 'ETIMEDOUT',
    failedAt: now,
  };
  if (status === 'outcome_unknown')
    await repository.markOutcomeUnknown({
      ...failure,
      failureClass: 'provider_outcome_unknown',
    });
  else
    await repository.markTerminalFailure({
      ...failure,
      failureClass: 'provider_terminal_failure',
    });
  return repository;
}

describe('RequeueRenewalNoticeDeliveryUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'rejects an invalid inspected attempt count %s',
    async (expectedAttemptCount) => {
      const repository = await createRepository('outcome_unknown');
      const input = {
        deliveryId,
        reason: 'Provider checked',
        operator: 'operator@example.com',
        confirmedNoSend: true,
        expectedAttemptCount,
      };
      await expect(
        new RequeueRenewalNoticeDeliveryUseCase(repository).execute(input),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(repository.records[0]?.status).toBe('outcome_unknown');
      expect(repository.records[0]?.requeueAudit).toEqual([]);
    },
  );

  it('refuses confirmation for an older attempt before the command starts', async () => {
    const repository = await createRepository('outcome_unknown');
    await repository.requeue({
      id: deliveryId,
      expectedAttemptCount: 1,
      reason: 'Other operator recovery',
      requeuedBy: 'other@example.com',
      requeuedAt: now,
      confirmedNoSend: true,
    });
    await repository.claim({
      id: deliveryId,
      attemptId: 'attempt-2',
      startedAt: now,
    });
    await repository.markOutcomeUnknown({
      id: deliveryId,
      attemptId: 'attempt-2',
      failureClass: 'provider_outcome_unknown',
      failureCode: 'timeout',
      failedAt: now,
    });
    const before = await repository.findById(deliveryId);
    const input = {
      deliveryId,
      reason: 'Only attempt 1 was checked',
      operator: 'operator@example.com',
      confirmedNoSend: true,
      expectedAttemptCount: 1,
    };

    await expect(
      new RequeueRenewalNoticeDeliveryUseCase(repository).execute(input),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(repository.findById(deliveryId)).resolves.toEqual(before);
  });

  it('requeues an unknown outcome only with no-send confirmation and preserves an audit entry', async () => {
    const repository = await createRepository('outcome_unknown');
    const useCase = new RequeueRenewalNoticeDeliveryUseCase(
      repository,
      () => now,
    );

    await expect(
      useCase.execute({
        deliveryId,
        expectedAttemptCount: 1,
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
          priorAttemptCount: 1,
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
        expectedAttemptCount: 1,
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
        expectedAttemptCount: 1,
        reason: 'Retry requested',
        operator: 'operator@example.com',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.records[0]?.status).toBe('outcome_unknown');
    expect(repository.records[0]?.requeueAudit).toEqual([]);
  });

  it('rejects missing operator evidence and accepted rows', async () => {
    const repository = await createRepository('terminal_failure');
    const useCase = new RequeueRenewalNoticeDeliveryUseCase(repository);

    await expect(
      useCase.execute({
        deliveryId,
        expectedAttemptCount: 1,
        reason: '   ',
        operator: 'operator@example.com',
        confirmedNoSend: false,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Renewal notice requeue requires an operator and an audit reason',
      ),
    );
    await expect(
      useCase.execute({
        deliveryId,
        expectedAttemptCount: 1,
        reason: 'Operator requested a retry',
        operator: '   ',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const existing = repository.records[0];
    if (!existing) throw new Error('Expected a delivery fixture');
    repository.records[0] = {
      ...existing,
      status: 'accepted',
    };
    await expect(
      useCase.execute({
        deliveryId,
        expectedAttemptCount: 1,
        reason: 'Operator requested a retry',
        operator: 'operator@example.com',
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('reads the system clock when none is injected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-06T19:30:00.000Z'));
    const repository = await createRepository('terminal_failure');

    const delivery = await new RequeueRenewalNoticeDeliveryUseCase(
      repository,
    ).execute({
      deliveryId,
      expectedAttemptCount: 1,
      reason: 'Retry approved after provider review',
      operator: 'operator@example.com',
      confirmedNoSend: false,
    });

    expect(delivery.requeueAudit).toMatchObject([
      { requeuedAt: '2026-08-06T19:30:00.000Z' },
    ]);
  });
});
