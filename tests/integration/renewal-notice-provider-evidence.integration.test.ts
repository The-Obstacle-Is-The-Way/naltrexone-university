import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { renewalNoticeDeliveries } from '@/db/schema';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import { closeConnection, createIntegrationDb } from './helpers';

// DEBT-414 F07: Resend's webhook reports whether an accepted renewal notice
// reached the inbox or bounced. The notice is found by the id Resend returned
// on acceptance.
const { db, sql } = createIntegrationDb();
const deliveryIds: string[] = [];
const hasher = new NobleSha256Hasher();
const acceptedAt = new Date('2026-09-30T12:00:00.000Z');
const observedAt = new Date('2026-09-30T12:05:00.000Z');
const repository = new DrizzleRenewalNoticeDeliveryRepository(
  db,
  hasher,
  () => acceptedAt,
);

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

// A notice Resend accepted, with the id Resend returned.
async function acceptedNotice() {
  const id = randomUUID();
  const providerEventId = `email_${randomUUID()}`;
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
  await repository.saveQueued({
    id,
    noticeKind: 'annual_reminder',
    consentRecordId: null,
    externalSubscriptionId: `sub_${id}`,
    applicableAt: new Date('2026-11-04T12:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    destination: payload.to,
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
    payloadSnapshot: snapshot,
    payloadHash: hash,
  });
  await repository.claim({ id, attemptId: 'attempt-1', startedAt: acceptedAt });
  await repository.markAccepted({
    id,
    attemptId: 'attempt-1',
    providerEventId,
    completedAt: acceptedAt,
  });
  return { id, providerEventId };
}

const bounced = {
  kind: 'failed',
  failureClass: 'provider_bounced',
  failureCode: 'Permanent',
} as const;

describe('renewal notice provider evidence', () => {
  it('marks an accepted notice delivered when Resend reports delivery', async () => {
    const notice = await acceptedNotice();

    await expect(
      repository.recordProviderOutcome({
        providerEventId: notice.providerEventId,
        outcome: { kind: 'delivered' },
        observedAt,
      }),
    ).resolves.toBe('recorded');
    await expect(repository.findById(notice.id)).resolves.toMatchObject({
      status: 'delivered',
      updatedAt: observedAt,
    });
  });

  it.each([
    ['accepted', false],
    ['delivered', true],
  ])(
    'records a bounce of a notice %s as a terminal failure',
    async (_status, deliveredFirst) => {
      const notice = await acceptedNotice();
      if (deliveredFirst) {
        await repository.recordProviderOutcome({
          providerEventId: notice.providerEventId,
          outcome: { kind: 'delivered' },
          observedAt: acceptedAt,
        });
      }

      await expect(
        repository.recordProviderOutcome({
          providerEventId: notice.providerEventId,
          outcome: bounced,
          observedAt,
        }),
      ).resolves.toBe('recorded');
      await expect(repository.findById(notice.id)).resolves.toMatchObject({
        status: 'terminal_failure',
        failureClass: 'provider_bounced',
        failureCode: 'Permanent',
        nextAttemptAt: null,
        updatedAt: observedAt,
      });
    },
  );

  it('keeps a failure when a delivery report arrives after it, and ignores a repeat', async () => {
    const notice = await acceptedNotice();
    await repository.recordProviderOutcome({
      providerEventId: notice.providerEventId,
      outcome: bounced,
      observedAt,
    });

    await expect(
      repository.recordProviderOutcome({
        providerEventId: notice.providerEventId,
        outcome: { kind: 'delivered' },
        observedAt,
      }),
    ).resolves.toBe('unchanged');
    await expect(
      repository.recordProviderOutcome({
        providerEventId: notice.providerEventId,
        outcome: bounced,
        observedAt,
      }),
    ).resolves.toBe('unchanged');
    await expect(repository.findById(notice.id)).resolves.toMatchObject({
      status: 'terminal_failure',
      failureClass: 'provider_bounced',
    });
  });

  it('reports an email that is not a renewal notice as unknown and changes nothing', async () => {
    const notice = await acceptedNotice();

    await expect(
      repository.recordProviderOutcome({
        providerEventId: `email_${randomUUID()}`,
        outcome: { kind: 'delivered' },
        observedAt,
      }),
    ).resolves.toBe('unknown');
    await expect(repository.findById(notice.id)).resolves.toMatchObject({
      status: 'accepted',
    });
  });
});
