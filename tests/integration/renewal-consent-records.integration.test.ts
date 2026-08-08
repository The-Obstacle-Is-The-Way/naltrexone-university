import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  renewalConsentRecords,
  renewalNoticeDeliveries,
  stripeSubscriptions,
  users,
} from '@/db/schema';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type { ReconcileStripeSubscriptionsDeps } from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const primary = createIntegrationDb();
const competing = createIntegrationDb();
const { db } = primary;
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
  await Promise.all([
    closeConnection(primary.sql),
    closeConnection(competing.sql),
  ]);
});

function consentInput(
  userId: string,
  sourceId = `cs_${randomUUID()}`,
  acceptedAt = new Date('2026-08-06T12:00:00Z'),
) {
  return newRenewalConsentRecord({
    userId,
    consumerReference: 'a'.repeat(64),
    externalCustomerId: 'cus_renewal_123',
    externalSubscriptionId: 'sub_renewal_123',
    checkoutSessionId: sourceId,
    setupSessionId: null,
    applicationSourceId: null,
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
    acceptedAt,
    consentKind: 'initial_offer',
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
  });
}

describe('renewal consent record persistence', () => {
  it('persists one exact snapshot under concurrent same-source deliveries', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(primary.db);
    const competingRepository = new DrizzleRenewalConsentRecordRepository(
      competing.db,
    );
    const input = consentInput(user.id);

    const [first, replay] = await Promise.all([
      repository.save(input),
      competingRepository.save(input),
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

  it('persists and finds application consent by its explicit source identity', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const input = {
      ...consentInput(user.id),
      checkoutSessionId: null,
      applicationSourceId: `application-consent:${randomUUID()}`,
      consentSource: 'application' as const,
      consentKind: 'price_increase' as const,
      priorAmountCents: 2900,
      proposedAmountCents: 3900,
      effectiveRenewalAt: new Date('2027-01-01T00:00:00Z'),
    };

    const saved = await repository.save(input);
    consentIds.push(saved.id);

    await expect(
      repository.findBySource({
        applicationSourceId: input.applicationSourceId,
      }),
    ).resolves.toEqual(saved);
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
      externalSubscriptionId: 'sub_renewal_terminated',
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
      externalSubscriptionId: terminated.externalSubscriptionId,
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
      externalSubscriptionId: saved.externalSubscriptionId,
      terminatedAt: new Date('2030-02-01T00:00:00Z'),
    });

    await repository.markSubscriptionTerminated({
      externalSubscriptionId: saved.externalSubscriptionId,
      terminatedAt: new Date('2027-01-01T00:00:00Z'),
    });

    await repository.markSubscriptionTerminated({
      externalSubscriptionId: saved.externalSubscriptionId,
      terminatedAt: new Date('2032-01-01T00:00:00Z'),
    });

    await expect(repository.findById(saved.id)).resolves.toMatchObject({
      subscriptionTerminatedAt: new Date('2030-02-01T00:00:00Z'),
      retainUntil: new Date('2031-02-01T00:00:00Z'),
    });
  });

  it('starts legal retention when reconciliation heals a missed cancellation webhook', async () => {
    const user = await createUser(db, cleanup);
    const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const repository = new DrizzleRenewalConsentRecordRepository(db);
    const saved = await repository.save({
      ...consentInput(
        user.id,
        `cs_${randomUUID()}`,
        new Date('2017-01-01T00:00:00Z'),
      ),
      externalCustomerId,
      externalSubscriptionId,
    });
    consentIds.push(saved.id);
    await db.insert(stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: externalSubscriptionId,
      status: 'active',
      priceId: 'price_test_monthly',
      currentPeriodEnd: new Date('2021-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    });
    const canceledSubscription = {
      id: externalSubscriptionId,
      customer: externalCustomerId,
      status: 'canceled' as const,
      cancel_at_period_end: false,
      metadata: { user_id: user.id },
      items: {
        data: [
          {
            current_period_end: 1_609_459_200,
            price: { id: 'price_test_monthly' },
          },
        ],
      },
    };
    const stripe = {
      customers: {
        create: async () => {
          throw new Error('Unexpected customers.create');
        },
      },
      checkout: {
        sessions: {
          create: async () => {
            throw new Error('Unexpected checkout.sessions.create');
          },
          list: async () => {
            throw new Error('Unexpected checkout.sessions.list');
          },
          retrieve: async () => {
            throw new Error('Unexpected checkout.sessions.retrieve');
          },
          expire: async () => {
            throw new Error('Unexpected checkout.sessions.expire');
          },
        },
      },
      subscriptions: {
        retrieve: async () => canceledSubscription,
        list: async () => ({ data: [] }),
        cancel: async () => canceledSubscription,
      },
      billingPortal: {
        sessions: {
          create: async () => {
            throw new Error('Unexpected billingPortal.sessions.create');
          },
        },
      },
      webhooks: {
        constructEvent: () => {
          throw new Error('Unexpected webhooks.constructEvent');
        },
      },
    } satisfies ReconcileStripeSubscriptionsDeps['stripe'];

    await expect(
      reconcileStripeSubscriptions(
        { limit: 1, offset: 0, dryRun: false, concurrency: 1 },
        {
          stripe,
          priceIds: {
            monthly: 'price_test_monthly',
            annual: 'price_test_annual',
          },
          logger: new FakeLogger(),
          now: () => new Date('2021-01-01T00:00:00Z'),
          listLocalSubscriptions: async () => [
            {
              userId: user.id,
              stripeSubscriptionId: externalSubscriptionId,
              version: 0,
            },
          ],
          transaction: (fn) =>
            db.transaction((tx) =>
              fn({
                subscriptions: new DrizzleSubscriptionRepository(tx, {
                  monthly: 'price_test_monthly',
                  annual: 'price_test_annual',
                }),
                stripeCustomers: new DrizzleStripeCustomerRepository(tx),
                renewalConsentRecords:
                  new DrizzleRenewalConsentRecordRepository(tx),
              }),
            ),
        },
      ),
    ).resolves.toMatchObject({ updated: 1, failed: 0 });
    await expect(repository.findById(saved.id)).resolves.toMatchObject({
      subscriptionTerminatedAt: new Date('2021-01-01T00:00:00Z'),
      retainUntil: new Date('2022-01-01T00:00:00Z'),
    });
    await expect(
      repository.pruneExpired({
        before: new Date('2021-12-31T23:59:59Z'),
        limit: 1,
      }),
    ).resolves.toBe(0);
    await expect(
      repository.pruneExpired({
        before: new Date('2022-01-01T00:00:00Z'),
        limit: 1,
      }),
    ).resolves.toBe(1);
  });
});
