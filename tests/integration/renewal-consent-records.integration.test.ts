import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  renewalConsentRecords,
  renewalNoticeDeliveries,
  users,
} from '@/db/schema';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const consentIds: string[] = [];

afterEach(async () => {
  if (consentIds.length > 0) {
    await db
      .delete(renewalConsentRecords)
      .where(inArray(renewalConsentRecords.id, consentIds));
  }
  consentIds.length = 0;
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function consentInput(userId: string, sourceId = `cs_${randomUUID()}`) {
  return newRenewalConsentRecord({
    userId,
    consumerReference: 'a'.repeat(64),
    stripeCustomerId: 'cus_renewal_123',
    stripeSubscriptionId: 'sub_renewal_123',
    checkoutSessionId: sourceId,
    setupSessionId: null,
    plan: 'monthly',
    amountCents: 2900,
    currency: 'usd',
    frequency: 'month',
    trialEndsAt: null,
    cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
    disclosureSnapshot: 'Exact immediate renewal disclosure.',
    disclosureVersion: '2026-08-05',
    termsVersion: '2026-08-05',
    termsHash: 'terms-hash',
    consentSource: 'stripe_checkout',
    acceptedAt: new Date('2026-08-06T12:00:00Z'),
    consentKind: 'initial_offer',
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
  });
}

describe('renewal consent record persistence', () => {
  it('persists one exact snapshot under concurrent same-source deliveries', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const input = consentInput(user.id);

    const [first, replay] = await Promise.all([
      repository.save(input),
      repository.save(input),
    ]);
    consentIds.push(first.id);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      ...input,
      userId: user.id,
      disclosureSnapshot: 'Exact immediate renewal disclosure.',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });
  });

  it('rejects a cross-user replay of the same Stripe Checkout Session', async () => {
    const firstUser = await createUser(db, cleanup);
    const secondUser = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const input = consentInput(firstUser.id);
    const saved = await repository.save(input);
    consentIds.push(saved.id);

    await expect(
      repository.save({ ...input, userId: secondUser.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('survives account deletion with its local user reference cleared', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const saved = await repository.save(consentInput(user.id));
    consentIds.push(saved.id);

    await db.delete(users).where(inArray(users.id, [user.id]));

    await expect(repository.findById(saved.id)).resolves.toMatchObject({
      userId: null,
      consumerReference: 'a'.repeat(64),
    });
  });

  it('prunes only terminated records whose legal retention date is due', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const activeInput = {
      ...consentInput(user.id),
      acceptedAt: new Date('2020-01-01T00:00:00Z'),
      retainUntil: new Date('2023-01-01T00:00:00Z'),
    };
    const active = await repository.save(activeInput);
    const terminated = await repository.save({
      ...activeInput,
      checkoutSessionId: `cs_${randomUUID()}`,
      stripeSubscriptionId: 'sub_renewal_terminated',
    });
    consentIds.push(active.id, terminated.id);
    const [acknowledgment] = await db
      .insert(renewalNoticeDeliveries)
      .values({
        noticeKind: 'acknowledgment',
        consentRecordId: terminated.id,
        disclosureVersion: terminated.disclosureVersion,
        destination: 'subscriber@example.com',
        providerIdempotencyKey: `renewal-notice/${randomUUID()}`,
        payloadSnapshot: 'Immutable acknowledgment.',
        payloadHash: 'b'.repeat(64),
      })
      .returning({ id: renewalNoticeDeliveries.id });
    if (!acknowledgment) {
      throw new Error('Acknowledgment fixture was not inserted');
    }
    await repository.markSubscriptionTerminated({
      stripeSubscriptionId: terminated.stripeSubscriptionId,
      terminatedAt: new Date('2021-01-01T00:00:00Z'),
    });

    await expect(
      repository.pruneExpired({
        before: new Date('2024-01-01T00:00:00Z'),
        limit: 1,
      }),
    ).resolves.toBe(1);
    await expect(repository.findById(active.id)).resolves.not.toBeNull();
    await expect(
      db.query.renewalNoticeDeliveries.findFirst({
        where: eq(renewalNoticeDeliveries.id, acknowledgment.id),
      }),
    ).resolves.toBeUndefined();
  });

  it('does not shorten retention for an out-of-order termination replay', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const saved = await repository.save(consentInput(user.id));
    consentIds.push(saved.id);
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
