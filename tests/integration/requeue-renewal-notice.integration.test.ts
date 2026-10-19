import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { renewalNoticeDeliveries } from '@/db/schema';
import { runRequeueRenewalNotice } from '@/scripts/requeue-renewal-notice';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
import { createMatchingRenewalNoticeTargets } from '@/src/application/test-helpers/renewal-notice-targets';
import { DispatchRenewalNoticeDeliveryUseCase } from '@/src/application/use-cases/dispatch-renewal-notice-delivery';
import type { RenewalNoticeDeliveryStatus } from '@/src/domain/entities';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { closeConnection, createIntegrationDb } from './helpers';

// DEBT-414 F23: the operator script, run with its production wiring against
// real Postgres, is the supported way to requeue a quarantined notice.

const { db, sql } = createIntegrationDb();
const hasher = new NobleSha256Hasher();
const repository = new DrizzleRenewalNoticeDeliveryRepository(db, hasher);
const deliveryIds: string[] = [];
const now = new Date('2026-10-18T12:00:00.000Z');
const OPERATOR = 'operator@example.com';

afterEach(async () => {
  vi.restoreAllMocks();
  if (deliveryIds.length > 0) {
    await db
      .delete(renewalNoticeDeliveries)
      .where(inArray(renewalNoticeDeliveries.id, deliveryIds));
  }
  deliveryIds.length = 0;
});

afterAll(async () => {
  await closeConnection(sql);
});

async function quarantinedDelivery(
  status: Extract<
    RenewalNoticeDeliveryStatus,
    'outcome_unknown' | 'terminal_failure'
  >,
): Promise<string> {
  const id = randomUUID();
  deliveryIds.push(id);
  const payload = createTransactionalEmailPayloadSnapshot(
    {
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: `subscriber-${id}@example.com`,
      replyTo: 'support@addictionboards.com',
      subject: 'Annual subscription reminder',
      html: '<p>Annual subscription reminder</p>',
      text: 'Annual subscription reminder',
    },
    hasher,
  );
  await repository.saveQueued({
    id,
    noticeKind: 'annual_reminder',
    consentRecordId: null,
    externalSubscriptionId: `sub_${id}`,
    applicableAt: new Date('2027-10-18T12:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    destination: `subscriber-${id}@example.com`,
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
    payloadSnapshot: payload.snapshot,
    payloadHash: payload.hash,
  });
  await repository.claim({ id, attemptId: 'attempt-1', startedAt: now });
  const failure = {
    id,
    attemptId: 'attempt-1',
    failedAt: now,
  };
  if (status === 'outcome_unknown') {
    await repository.markOutcomeUnknown({
      ...failure,
      failureClass: 'provider_outcome_unknown',
      failureCode: 'provider_timeout',
    });
  } else {
    await repository.markTerminalFailure({
      ...failure,
      failureClass: 'provider_terminal_failure',
      failureCode: 'validation_error',
    });
  }
  return id;
}

function runScript(argv: string[]) {
  const output = new PassThrough();
  return runRequeueRenewalNotice({
    argv,
    env: { ...process.env, RENEWAL_NOTICE_OPERATOR: OPERATOR },
    output,
    errorOutput: output,
    now: () => now,
  });
}

describe('requeue-renewal-notice script', () => {
  it('requeues an unknown outcome with its audit, and the next run finds it due', async () => {
    const id = await quarantinedDelivery('outcome_unknown');

    await runScript([
      '--delivery-id',
      id,
      '--reason',
      'Resend shows no email for this notice',
      '--confirmed-no-send',
    ]);

    await expect(repository.findById(id)).resolves.toMatchObject({
      status: 'queued',
      failureClass: null,
      failureCode: null,
      requeueReason: 'Resend shows no email for this notice',
      requeuedBy: OPERATOR,
      requeuedAt: now,
      requeueAudit: [
        {
          reason: 'Resend shows no email for this notice',
          requeuedAt: now.toISOString(),
          requeuedBy: OPERATOR,
          confirmedNoSend: true,
          priorStatus: 'outcome_unknown',
        },
      ],
    });
    await expect(
      repository.findDue({ now, limit: Number.MAX_SAFE_INTEGER }),
    ).resolves.toContainEqual(expect.objectContaining({ id }));
  });

  it('sends a requeued notice through dispatch and records its delivery without losing the audit', async () => {
    const id = await quarantinedDelivery('outcome_unknown');
    const before = await repository.findById(id);
    await runScript([
      '--delivery-id',
      id,
      '--reason',
      'Provider confirmed no send',
      '--confirmed-no-send',
    ]);
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      results: [{ status: 'accepted', providerEventId: `email_${id}` }],
    });
    const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
      repository,
      gateway,
      await createMatchingRenewalNoticeTargets({
        externalSubscriptionIds: [`sub_${id}`],
        renewalAt: new Date('2027-10-18T12:00:00.000Z'),
        destination: `subscriber-${id}@example.com`,
      }),
      hasher,
      new FakeLogger(),
      new FakeOperationalAlerts(),
      () => now,
    );

    await dispatch.execute({ deliveryId: id });
    await repository.recordProviderOutcome({
      providerEventId: `email_${id}`,
      outcome: { kind: 'delivered' },
      observedAt: now,
    });

    expect(gateway.sendInputs).toHaveLength(1);
    expect(gateway.sendInputs[0]?.idempotencyKey).toBe(
      before?.providerIdempotencyKey,
    );
    await expect(repository.findById(id)).resolves.toMatchObject({
      status: 'delivered',
      payloadSnapshot: before?.payloadSnapshot,
      payloadHash: before?.payloadHash,
      requeueAudit: [
        expect.objectContaining({
          requeuedBy: OPERATOR,
          confirmedNoSend: true,
        }),
      ],
    });
  });

  it('rejects a stale requeue after another operator retries and a new attempt is quarantined', async () => {
    const id = await quarantinedDelivery('outcome_unknown');
    const read = createDeferred<void>();
    const resume = createDeferred<void>();
    const originalRead =
      DrizzleRenewalNoticeDeliveryRepository.prototype.findById;
    vi.spyOn(
      DrizzleRenewalNoticeDeliveryRepository.prototype,
      'findById',
    ).mockImplementationOnce(async function (
      this: DrizzleRenewalNoticeDeliveryRepository,
      deliveryId,
    ) {
      const snapshot = await originalRead.call(this, deliveryId);
      read.resolve(undefined);
      await resume.promise;
      return snapshot;
    });
    const staleAttempt = runScript([
      '--delivery-id',
      id,
      '--reason',
      'First attempt was not sent',
      '--confirmed-no-send',
    ]);
    // Attach rejection handling before allowing either operation to finish.
    const result = staleAttempt.then(
      () => ({ code: 'unexpected_success' }),
      (error: unknown) => error,
    );
    await read.promise;
    try {
      await repository.requeue({
        id,
        reason: 'Other operator recovery',
        requeuedBy: 'other@example.com',
        requeuedAt: now,
        confirmedNoSend: true,
      });
      await repository.claim({ id, attemptId: 'attempt-2', startedAt: now });
      await repository.markOutcomeUnknown({
        id,
        attemptId: 'attempt-2',
        failureClass: 'provider_outcome_unknown',
        failureCode: 'provider_timeout',
        failedAt: now,
      });
    } finally {
      resume.resolve(undefined);
    }

    await expect(result).resolves.toMatchObject({ code: 'CONFLICT' });
    await expect(repository.findById(id)).resolves.toMatchObject({
      status: 'outcome_unknown',
      attemptCount: 2,
      requeueAudit: [
        expect.objectContaining({
          reason: 'Other operator recovery',
          requeuedBy: 'other@example.com',
        }),
      ],
    });
  });

  it('leaves an unknown outcome quarantined without the no-send confirmation', async () => {
    const id = await quarantinedDelivery('outcome_unknown');

    await expect(
      runScript(['--delivery-id', id, '--reason', 'Retry requested']),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(repository.findById(id)).resolves.toMatchObject({
      status: 'outcome_unknown',
      failureCode: 'provider_timeout',
      requeuedBy: null,
      requeueAudit: [],
    });
  });

  it('requeues a terminal failure without a no-send confirmation, and records that', async () => {
    const id = await quarantinedDelivery('terminal_failure');

    await runScript([
      '--delivery-id',
      id,
      '--reason',
      'Subscriber fixed their mailbox; resend approved',
    ]);

    await expect(repository.findById(id)).resolves.toMatchObject({
      status: 'queued',
      requeueAudit: [
        expect.objectContaining({
          confirmedNoSend: false,
          priorStatus: 'terminal_failure',
        }),
      ],
    });
  });
});
