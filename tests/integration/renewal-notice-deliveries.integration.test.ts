import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { renewalNoticeDeliveries } from '@/db/schema';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import type { NewRenewalNoticeDelivery } from '@/src/domain/entities';
import { closeConnection, createIntegrationDb } from './helpers';

const primary = createIntegrationDb();
const competing = createIntegrationDb();
const deliveryIds: string[] = [];
const now = new Date('2026-08-06T18:00:00.000Z');
const hasher = new NobleSha256Hasher();

afterEach(async () => {
  if (deliveryIds.length > 0) {
    await primary.db
      .delete(renewalNoticeDeliveries)
      .where(inArray(renewalNoticeDeliveries.id, deliveryIds));
  }
  deliveryIds.length = 0;
});

afterAll(async () => {
  await Promise.all([
    closeConnection(primary.sql),
    closeConnection(competing.sql),
  ]);
});

function createDelivery(
  overrides: Partial<NewRenewalNoticeDelivery> = {},
): NewRenewalNoticeDelivery {
  const id = overrides.id ?? randomUUID();
  const payload = {
    from: 'Addiction Boards <notices@addictionboards.com>',
    to: `subscriber-${id}@example.com`,
    replyTo: 'support@addictionboards.com',
    subject: 'Annual subscription reminder',
    html: '<p>Annual subscription reminder</p>',
    text: 'Annual subscription reminder',
  };
  const { snapshot, hash } = createTransactionalEmailPayloadSnapshot(
    payload,
    hasher,
  );
  deliveryIds.push(id);
  return {
    id,
    noticeKind: 'annual_reminder',
    consentRecordId: null,
    externalSubscriptionId: `sub_${id}`,
    applicableAt: new Date('2027-08-06T18:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    destination: payload.to,
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
    payloadSnapshot: snapshot,
    payloadHash: hash,
    ...overrides,
  };
}

describe('renewal notice delivery persistence', () => {
  it('keeps concurrent exact creation idempotent and rejects changed payload', async () => {
    const firstRepository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const secondRepository = new DrizzleRenewalNoticeDeliveryRepository(
      competing.db,
      hasher,
      () => now,
    );
    const input = createDelivery();

    const [first, replay] = await Promise.all([
      firstRepository.saveQueued(input),
      secondRepository.saveQueued(input),
    ]);
    const replacementId = randomUUID();
    deliveryIds.push(replacementId);
    const businessKeyReplay = await secondRepository.saveQueued({
      ...input,
      id: replacementId,
      providerIdempotencyKey:
        getRenewalNoticeProviderIdempotencyKey(replacementId),
    });

    expect(replay).toEqual(first);
    expect(businessKeyReplay).toEqual(first);
    const changedPayload = createTransactionalEmailPayloadSnapshot(
      {
        from: 'Addiction Boards <notices@addictionboards.com>',
        to: input.destination,
        replyTo: 'support@addictionboards.com',
        subject: 'Changed annual subscription reminder',
        html: '<p>Changed annual subscription reminder</p>',
        text: 'Changed annual subscription reminder',
      },
      hasher,
    );
    await expect(
      secondRepository.saveQueued({
        ...input,
        payloadSnapshot: changedPayload.snapshot,
        payloadHash: changedPayload.hash,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Renewal notice delivery identity is bound to another payload',
    });
  });

  it('rejects malformed immutable evidence before inserting a row', async () => {
    const repository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const wrongKey = createDelivery({
      providerIdempotencyKey: 'renewal-notice/wrong',
    });
    const wrongHash = createDelivery({ payloadHash: '0'.repeat(64) });

    await expect(repository.saveQueued(wrongKey)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(repository.saveQueued(wrongHash)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(repository.findById(wrongKey.id)).resolves.toBeNull();
    await expect(repository.findById(wrongHash.id)).resolves.toBeNull();
  });

  it('allows only one connection to claim a queued row', async () => {
    const firstRepository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const secondRepository = new DrizzleRenewalNoticeDeliveryRepository(
      competing.db,
      hasher,
      () => now,
    );
    const saved = await firstRepository.saveQueued(createDelivery());

    const [first, second] = await Promise.all([
      firstRepository.claim({
        id: saved.id,
        attemptId: 'attempt-1',
        startedAt: now,
      }),
      secondRepository.claim({
        id: saved.id,
        attemptId: 'attempt-2',
        startedAt: now,
      }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    await expect(firstRepository.findById(saved.id)).resolves.toMatchObject({
      status: 'processing',
      attemptCount: 1,
      attemptId: first?.attemptId ?? second?.attemptId,
      attemptStartedAt: now,
    });
  });

  it('selects queued and due transient rows but excludes terminal and unknown rows', async () => {
    const repository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const queued = await repository.saveQueued(createDelivery());
    const dueTransient = await repository.saveQueued(createDelivery());
    const futureTransient = await repository.saveQueued(createDelivery());
    const terminal = await repository.saveQueued(createDelivery());
    const unknown = await repository.saveQueued(createDelivery());
    await primary.db
      .update(renewalNoticeDeliveries)
      .set({
        status: 'transient_failure',
        nextAttemptAt: new Date('2026-08-06T17:59:00.000Z'),
      })
      .where(eq(renewalNoticeDeliveries.id, dueTransient.id));
    await primary.db
      .update(renewalNoticeDeliveries)
      .set({
        status: 'transient_failure',
        nextAttemptAt: new Date('2026-08-06T18:01:00.000Z'),
      })
      .where(eq(renewalNoticeDeliveries.id, futureTransient.id));
    await primary.db
      .update(renewalNoticeDeliveries)
      .set({ status: 'terminal_failure' })
      .where(eq(renewalNoticeDeliveries.id, terminal.id));
    await primary.db
      .update(renewalNoticeDeliveries)
      .set({ status: 'outcome_unknown' })
      .where(eq(renewalNoticeDeliveries.id, unknown.id));

    const due = await repository.findDue({ now, limit: 10 });

    expect(new Set(due.map((delivery) => delivery.id))).toEqual(
      new Set([queued.id, dueTransient.id]),
    );
  });

  it('requires claim ownership for outcomes and persists retry scheduling', async () => {
    const repository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const saved = await repository.saveQueued(createDelivery());
    await repository.claim({
      id: saved.id,
      attemptId: 'attempt-1',
      startedAt: now,
    });

    await expect(
      repository.markDelivered({
        id: saved.id,
        attemptId: 'other-attempt',
        providerEventId: 'email_wrong',
        completedAt: now,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      repository.markTransientFailure({
        id: saved.id,
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

  it('persists delivered, terminal, and unknown outcomes with their last attempt evidence', async () => {
    const repository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const delivered = await repository.saveQueued(createDelivery());
    const terminal = await repository.saveQueued(createDelivery());
    const unknown = await repository.saveQueued(createDelivery());
    await repository.claim({
      id: delivered.id,
      attemptId: 'delivered-attempt',
      startedAt: now,
    });
    await repository.claim({
      id: terminal.id,
      attemptId: 'terminal-attempt',
      startedAt: now,
    });
    await repository.claim({
      id: unknown.id,
      attemptId: 'unknown-attempt',
      startedAt: now,
    });

    await expect(
      repository.markDelivered({
        id: delivered.id,
        attemptId: 'delivered-attempt',
        providerEventId: 'email_123',
        completedAt: now,
      }),
    ).resolves.toMatchObject({
      status: 'delivered',
      providerEventId: 'email_123',
      attemptId: 'delivered-attempt',
      attemptStartedAt: now,
    });
    await expect(
      repository.markTerminalFailure({
        id: terminal.id,
        attemptId: 'terminal-attempt',
        failureClass: 'provider_terminal_failure',
        failureCode: 'invalid_idempotent_request',
        failedAt: now,
      }),
    ).resolves.toMatchObject({
      status: 'terminal_failure',
      failureCode: 'invalid_idempotent_request',
      attemptId: 'terminal-attempt',
      attemptStartedAt: now,
    });
    await expect(
      repository.markOutcomeUnknown({
        id: unknown.id,
        attemptId: 'unknown-attempt',
        failureClass: 'provider_outcome_unknown',
        failureCode: 'provider_timeout',
        failedAt: now,
      }),
    ).resolves.toMatchObject({
      status: 'outcome_unknown',
      failureCode: 'provider_timeout',
      attemptId: 'unknown-attempt',
      attemptStartedAt: now,
    });
  });

  it('quarantines stale claims and requires audited no-send confirmation to requeue', async () => {
    const repository = new DrizzleRenewalNoticeDeliveryRepository(
      primary.db,
      hasher,
      () => now,
    );
    const saved = await repository.saveQueued(createDelivery());
    await repository.claim({
      id: saved.id,
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
    await expect(
      repository.requeue({
        id: saved.id,
        reason: 'Confirmed in Resend that no email exists',
        requeuedBy: 'operator@example.com',
        requeuedAt: now,
        confirmedNoSend: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      repository.requeue({
        id: saved.id,
        reason: 'Confirmed in Resend that no email exists',
        requeuedBy: 'operator@example.com',
        requeuedAt: now,
        confirmedNoSend: true,
      }),
    ).resolves.toMatchObject({
      status: 'queued',
      attemptId: 'attempt-1',
      attemptStartedAt: new Date('2026-08-06T17:00:00.000Z'),
      requeueAudit: [
        expect.objectContaining({
          priorStatus: 'outcome_unknown',
          confirmedNoSend: true,
        }),
      ],
    });
  });
});
