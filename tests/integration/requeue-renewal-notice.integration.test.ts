import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { renewalNoticeDeliveries } from '@/db/schema';
import { runRequeueRenewalNotice } from '@/scripts/requeue-renewal-notice';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import type { RenewalNoticeDeliveryStatus } from '@/src/domain/entities';
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
  return runRequeueRenewalNotice({
    argv,
    env: { ...process.env, RENEWAL_NOTICE_OPERATOR: OPERATOR },
    output: { write: () => true },
    errorOutput: { write: () => true },
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
