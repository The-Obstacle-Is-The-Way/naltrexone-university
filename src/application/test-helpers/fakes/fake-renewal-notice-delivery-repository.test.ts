import { describe, expect, it } from 'vitest';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import type { NewRenewalNoticeDelivery } from '@/src/domain/entities';
import { FakeRenewalNoticeDeliveryRepository } from './fake-renewal-notice-delivery-repository';
import { FakeSha256Hasher } from './fake-sha256-hasher';

const now = new Date('2026-08-06T18:00:00.000Z');
const deliveryId = '11111111-1111-4111-8111-111111111111';
const consentRecordId = '22222222-2222-4222-8222-222222222222';
const emailPayload = {
  from: 'Addiction Boards <notices@addictionboards.com>',
  to: 'subscriber@example.com',
  replyTo: 'support@addictionboards.com',
  subject: 'Your renewal terms',
  html: '<p>Renewal terms</p>',
  text: 'Renewal terms',
};
const hasher = new FakeSha256Hasher();
const payload = createTransactionalEmailPayloadSnapshot(emailPayload, hasher);

function createDelivery(
  overrides: Partial<NewRenewalNoticeDelivery> = {},
): NewRenewalNoticeDelivery {
  return {
    id: deliveryId,
    noticeKind: 'acknowledgment',
    consentRecordId,
    externalSubscriptionId: null,
    applicableAt: null,
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
    payloadSnapshot: payload.snapshot,
    payloadHash: payload.hash,
    ...overrides,
  };
}

describe('FakeRenewalNoticeDeliveryRepository', () => {
  it('rejects a notice-kind key shape the database would reject', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);

    await expect(
      repository.saveQueued(
        createDelivery({
          noticeKind: 'renewal_notice',
          consentRecordId,
          externalSubscriptionId: null,
          applicableAt: null,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps exact queue creation idempotent and rejects changed payload', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);

    const first = await repository.saveQueued(createDelivery());
    const replay = await repository.saveQueued(createDelivery());
    const replacementId = '33333333-3333-4333-8333-333333333333';
    const businessKeyReplay = await repository.saveQueued(
      createDelivery({
        id: replacementId,
        providerIdempotencyKey:
          getRenewalNoticeProviderIdempotencyKey(replacementId),
      }),
    );

    expect(replay).toEqual(first);
    expect(businessKeyReplay).toEqual(first);
    expect(repository.records).toHaveLength(1);
    const changedPayload = createTransactionalEmailPayloadSnapshot(
      {
        ...emailPayload,
        subject: 'Changed renewal terms',
      },
      hasher,
    );
    const changedId = '44444444-4444-4444-8444-444444444444';
    await expect(
      repository.saveQueued(
        createDelivery({
          id: changedId,
          providerIdempotencyKey:
            getRenewalNoticeProviderIdempotencyKey(changedId),
          payloadSnapshot: changedPayload.snapshot,
          payloadHash: changedPayload.hash,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Renewal notice delivery identity is bound to another payload',
    });
  });

  it('rejects a non-derived provider key and a changed payload hash before persistence', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);

    await expect(
      repository.saveQueued(
        createDelivery({ providerIdempotencyKey: 'renewal-notice/wrong' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      repository.saveQueued(createDelivery({ payloadHash: '0'.repeat(64) })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(repository.records).toEqual([]);
  });

  it('selects only queued and due transient failures', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    const statuses = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        status: 'transient_failure' as const,
        nextAttemptAt: new Date('2026-08-06T17:59:00.000Z'),
      },
      { id: deliveryId, status: 'queued' as const, nextAttemptAt: null },
      {
        id: '44444444-4444-4444-8444-444444444444',
        status: 'transient_failure' as const,
        nextAttemptAt: new Date('2026-08-06T18:01:00.000Z'),
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        status: 'terminal_failure' as const,
        nextAttemptAt: null,
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        status: 'outcome_unknown' as const,
        nextAttemptAt: null,
      },
    ];
    for (const [index, state] of statuses.entries()) {
      const saved = await repository.saveQueued(
        createDelivery({
          id: state.id,
          consentRecordId: `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`,
          providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(
            state.id,
          ),
        }),
      );
      repository.records[index] = {
        ...saved,
        status: state.status,
        nextAttemptAt: state.nextAttemptAt,
      };
    }

    const due = await repository.findDue({ now, limit: 10 });

    expect(due.map((delivery) => delivery.id)).toEqual([
      deliveryId,
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('allows only one worker to atomically claim a queued delivery', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());

    const [first, second] = await Promise.all([
      repository.claim({
        id: deliveryId,
        attemptId: 'attempt-1',
        startedAt: now,
      }),
      repository.claim({
        id: deliveryId,
        attemptId: 'attempt-2',
        startedAt: now,
      }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(repository.records[0]).toMatchObject({
      status: 'processing',
      attemptCount: 1,
      attemptId: first?.attemptId ?? second?.attemptId,
      attemptStartedAt: now,
      lastAttemptAt: now,
    });
  });

  it('persists delivered and failed outcomes only for the owning claim', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    await repository.claim({
      id: deliveryId,
      attemptId: 'attempt-1',
      startedAt: now,
    });

    await expect(
      repository.markDelivered({
        id: deliveryId,
        attemptId: 'other-attempt',
        providerEventId: 'email_wrong',
        completedAt: now,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      repository.markTransientFailure({
        id: deliveryId,
        attemptId: 'attempt-1',
        failureClass: 'provider_non_acceptance',
        failureCode: 'rate_limit_exceeded',
        failedAt: now,
        nextAttemptAt: new Date('2026-08-06T18:15:00.000Z'),
      }),
    ).resolves.toMatchObject({
      status: 'transient_failure',
      attemptId: 'attempt-1',
      attemptStartedAt: now,
      failureCode: 'rate_limit_exceeded',
      nextAttemptAt: new Date('2026-08-06T18:15:00.000Z'),
    });
  });

  it('quarantines stale processing claims as outcome_unknown', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    await repository.claim({
      id: deliveryId,
      attemptId: 'attempt-1',
      startedAt: new Date('2026-08-06T17:00:00.000Z'),
    });

    await expect(
      repository.markStaleProcessingUnknown({
        staleBefore: new Date('2026-08-06T17:45:00.000Z'),
        observedAt: now,
        limit: 10,
      }),
    ).resolves.toBe(1);
    expect(repository.records[0]).toMatchObject({
      status: 'outcome_unknown',
      attemptId: 'attempt-1',
      attemptStartedAt: new Date('2026-08-06T17:00:00.000Z'),
      failureClass: 'stale_processing_claim',
      failureCode: 'worker_outcome_unknown',
      nextAttemptAt: null,
    });
  });

  it('quarantines the oldest stale processing claim first when limited', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    const newerId = '33333333-3333-4333-8333-333333333333';
    await repository.saveQueued(createDelivery());
    await repository.saveQueued(
      createDelivery({
        id: newerId,
        consentRecordId: '33333333-3333-4333-8333-333333333333',
        providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(newerId),
      }),
    );
    await repository.claim({
      id: newerId,
      attemptId: 'newer-attempt',
      startedAt: new Date('2026-08-06T17:30:00.000Z'),
    });
    await repository.claim({
      id: deliveryId,
      attemptId: 'oldest-attempt',
      startedAt: new Date('2026-08-06T17:00:00.000Z'),
    });

    await expect(
      repository.markStaleProcessingUnknown({
        staleBefore: new Date('2026-08-06T17:45:00.000Z'),
        observedAt: now,
        limit: 1,
      }),
    ).resolves.toBe(1);
    await expect(repository.findById(deliveryId)).resolves.toMatchObject({
      status: 'outcome_unknown',
    });
    await expect(repository.findById(newerId)).resolves.toMatchObject({
      status: 'processing',
    });
  });

  it('requires no-send confirmation to requeue unknown outcomes and preserves audit', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    const saved = await repository.saveQueued(createDelivery());
    repository.records[0] = {
      ...saved,
      status: 'outcome_unknown',
      attemptId: 'attempt-1',
      attemptStartedAt: now,
      lastAttemptAt: now,
    };

    await expect(
      repository.requeue({
        id: deliveryId,
        reason: 'Confirmed in Resend that no email exists',
        requeuedBy: 'operator@example.com',
        requeuedAt: now,
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      repository.requeue({
        id: deliveryId,
        reason: 'Confirmed in Resend that no email exists',
        requeuedBy: 'operator@example.com',
        requeuedAt: now,
        confirmedNoSend: true,
      }),
    ).resolves.toMatchObject({
      status: 'queued',
      attemptId: 'attempt-1',
      requeueAudit: [
        {
          reason: 'Confirmed in Resend that no email exists',
          requeuedBy: 'operator@example.com',
          requeuedAt: now.toISOString(),
          confirmedNoSend: true,
          priorStatus: 'outcome_unknown',
        },
      ],
    });
  });
});
