import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  renewalNoticeDeliveries,
  stripeSubscriptions,
  users,
} from '@/db/schema';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import {
  listAnnualRenewalsPastNoticeDeadline,
  listAnnualSubscriptionsDue,
} from '@/src/adapters/jobs/send-due-renewal-notices';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const deliveryIds: string[] = [];
const hasher = new NobleSha256Hasher();

afterEach(async () => {
  if (deliveryIds.length > 0) {
    await db
      .delete(renewalNoticeDeliveries)
      .where(inArray(renewalNoticeDeliveries.id, deliveryIds));
  }
  deliveryIds.length = 0;
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('renewal notice job query', () => {
  it('selects only active, renewing annual subscriptions in the supplied window', async () => {
    const annualPriceId = 'price_test_annual';
    const inWindow = new Date('2026-09-06T12:00:00.000Z');
    const rows = [
      {
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: inWindow,
      },
      {
        status: 'active',
        priceId: 'price_test_monthly',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: inWindow,
      },
      {
        status: 'canceled',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: inWindow,
      },
      {
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: inWindow,
      },
      {
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-10-06T12:00:00.000Z'),
      },
    ] as const;
    const expected: { externalSubscriptionId: string; destination: string }[] =
      [];
    for (const [index, input] of rows.entries()) {
      const user = await createUser(db, cleanup);
      const externalSubscriptionId = `sub_${index}_${randomUUID().replaceAll('-', '')}`;
      await db.insert(stripeSubscriptions).values({
        userId: user.id,
        stripeSubscriptionId: externalSubscriptionId,
        ...input,
      });
      if (index === 0) {
        expected.push({ externalSubscriptionId, destination: user.email });
      }
    }

    const result = await listAnnualSubscriptionsDue(
      {
        renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
        renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
        disclosureVersion: '2026-08-05',
        limit: 100,
      },
      { db, annualPriceId },
    );

    expect(result).toEqual([
      {
        ...expected[0],
        renewalAt: inWindow,
      },
    ]);
  });

  it('skips subscriptions whose scheduled notice kinds already exist before applying the limit', async () => {
    const annualPriceId = 'price_test_annual';
    const disclosureVersion = '2026-08-05';
    const alreadyCoveredRenewal = new Date('2026-09-01T12:00:00.000Z');
    const uncoveredRenewal = new Date('2026-09-02T12:00:00.000Z');
    const coveredUser = await createUser(db, cleanup);
    const uncoveredUser = await createUser(db, cleanup);
    const coveredSubscriptionId = `sub_covered_${randomUUID().replaceAll('-', '')}`;
    const uncoveredSubscriptionId = `sub_uncovered_${randomUUID().replaceAll('-', '')}`;
    await db.insert(stripeSubscriptions).values([
      {
        userId: coveredUser.id,
        stripeSubscriptionId: coveredSubscriptionId,
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: alreadyCoveredRenewal,
      },
      {
        userId: uncoveredUser.id,
        stripeSubscriptionId: uncoveredSubscriptionId,
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: uncoveredRenewal,
      },
    ]);
    const scheduledRows = (['annual_reminder', 'renewal_notice'] as const).map(
      (noticeKind) => {
        const id = randomUUID();
        deliveryIds.push(id);
        const payload = createTransactionalEmailPayloadSnapshot(
          {
            from: 'Addiction Boards <notices@addictionboards.com>',
            to: coveredUser.email,
            replyTo: 'support@addictionboards.com',
            subject: `Scheduled notice: ${noticeKind}`,
            html: `<p>Scheduled notice: ${noticeKind}</p>`,
            text: `Scheduled notice: ${noticeKind}`,
          },
          hasher,
        );
        return {
          id,
          noticeKind,
          consentRecordId: null,
          stripeSubscriptionId: coveredSubscriptionId,
          applicableAt: alreadyCoveredRenewal,
          disclosureVersion,
          destination: coveredUser.email,
          providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
          payloadSnapshot: payload.snapshot,
          payloadHash: payload.hash,
        };
      },
    );
    await db.insert(renewalNoticeDeliveries).values(scheduledRows);
    const query = {
      renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
      renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
      disclosureVersion,
      limit: 1,
    };

    const result = await listAnnualSubscriptionsDue(query, {
      db,
      annualPriceId,
    });

    expect(result).toEqual([
      {
        externalSubscriptionId: uncoveredSubscriptionId,
        renewalAt: uncoveredRenewal,
        destination: uncoveredUser.email,
      },
    ]);

    const renewalNotice = scheduledRows.find(
      (row) => row.noticeKind === 'renewal_notice',
    );
    if (!renewalNotice) throw new Error('expected renewal-notice fixture');
    await db
      .delete(renewalNoticeDeliveries)
      .where(eq(renewalNoticeDeliveries.id, renewalNotice.id));

    await expect(
      listAnnualSubscriptionsDue(query, { db, annualPriceId }),
    ).resolves.toEqual([
      {
        externalSubscriptionId: coveredSubscriptionId,
        renewalAt: alreadyCoveredRenewal,
        destination: coveredUser.email,
      },
    ]);
  });

  it('treats disclosure version and destination as scheduled-notice identity fields', async () => {
    const annualPriceId = 'price_test_annual';
    const disclosureVersion = '2026-08-05';
    const renewalAt = new Date('2026-09-01T12:00:00.000Z');
    const user = await createUser(db, cleanup);
    const subscriptionId = `sub_identity_${randomUUID().replaceAll('-', '')}`;
    await db.insert(stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: subscriptionId,
      status: 'active',
      priceId: annualPriceId,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: renewalAt,
    });
    for (const noticeKind of ['annual_reminder', 'renewal_notice'] as const) {
      const id = randomUUID();
      deliveryIds.push(id);
      const payload = createTransactionalEmailPayloadSnapshot(
        {
          from: 'Addiction Boards <notices@addictionboards.com>',
          to: user.email,
          replyTo: 'support@addictionboards.com',
          subject: `Scheduled notice: ${noticeKind}`,
          html: `<p>Scheduled notice: ${noticeKind}</p>`,
          text: `Scheduled notice: ${noticeKind}`,
        },
        hasher,
      );
      await db.insert(renewalNoticeDeliveries).values({
        id,
        noticeKind,
        consentRecordId: null,
        stripeSubscriptionId: subscriptionId,
        applicableAt: renewalAt,
        disclosureVersion,
        destination: user.email,
        providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
        payloadSnapshot: payload.snapshot,
        payloadHash: payload.hash,
      });
    }
    const query = {
      renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
      renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
      disclosureVersion,
      limit: 1,
    };

    await expect(
      listAnnualSubscriptionsDue(
        { ...query, disclosureVersion: '2026-08-06' },
        { db, annualPriceId },
      ),
    ).resolves.toEqual([
      {
        externalSubscriptionId: subscriptionId,
        renewalAt,
        destination: user.email,
      },
    ]);

    const changedDestination = `changed-${user.email}`;
    await db
      .update(users)
      .set({ email: changedDestination })
      .where(eq(users.id, user.id));
    await expect(
      listAnnualSubscriptionsDue(query, { db, annualPriceId }),
    ).resolves.toEqual([
      {
        externalSubscriptionId: subscriptionId,
        renewalAt,
        destination: changedDestination,
      },
    ]);
  });

  it('uses subscription id as a deterministic tie-breaker before applying the limit', async () => {
    const annualPriceId = 'price_test_annual';
    const renewalAt = new Date('2026-09-01T12:00:00.000Z');
    const laterUser = await createUser(db, cleanup);
    const earlierUser = await createUser(db, cleanup);
    await db.insert(stripeSubscriptions).values([
      {
        userId: laterUser.id,
        stripeSubscriptionId: 'sub_tie_z',
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: renewalAt,
      },
      {
        userId: earlierUser.id,
        stripeSubscriptionId: 'sub_tie_a',
        status: 'active',
        priceId: annualPriceId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: renewalAt,
      },
    ]);

    await expect(
      listAnnualSubscriptionsDue(
        {
          renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
          renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
          disclosureVersion: '2026-08-05',
          limit: 1,
        },
        { db, annualPriceId },
      ),
    ).resolves.toEqual([
      {
        externalSubscriptionId: 'sub_tie_a',
        renewalAt,
        destination: earlierUser.email,
      },
    ]);
  });
});

describe('renewal notice deadline query', () => {
  const annualPriceId = 'price_test_annual';
  const now = new Date('2026-08-07T12:00:00.000Z');
  const deadline = new Date('2026-09-06T12:00:00.000Z');
  const window = { renewalAfter: now, renewalAtOrBefore: deadline, limit: 100 };

  async function insertSubscription(input: {
    status?: 'active' | 'canceled';
    priceId?: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd: Date;
  }) {
    const user = await createUser(db, cleanup);
    const externalSubscriptionId = `sub_deadline_${randomUUID().replaceAll('-', '')}`;
    await db.insert(stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: externalSubscriptionId,
      status: input.status ?? 'active',
      priceId: input.priceId ?? annualPriceId,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: input.currentPeriodEnd,
    });
    return { externalSubscriptionId, email: user.email, userId: user.id };
  }

  async function insertNotice(input: {
    noticeKind: 'annual_reminder' | 'renewal_notice';
    externalSubscriptionId: string;
    applicableAt: Date;
    destination: string;
    status: 'queued' | 'delivered' | 'terminal_failure';
  }) {
    const id = randomUUID();
    deliveryIds.push(id);
    const payload = createTransactionalEmailPayloadSnapshot(
      {
        from: 'Addiction Boards <notices@addictionboards.com>',
        to: input.destination,
        replyTo: 'support@addictionboards.com',
        subject: `Scheduled notice: ${input.noticeKind}`,
        html: `<p>Scheduled notice: ${input.noticeKind}</p>`,
        text: `Scheduled notice: ${input.noticeKind}`,
      },
      hasher,
    );
    await db.insert(renewalNoticeDeliveries).values({
      id,
      noticeKind: input.noticeKind,
      consentRecordId: null,
      stripeSubscriptionId: input.externalSubscriptionId,
      applicableAt: input.applicableAt,
      disclosureVersion: '2026-08-05',
      destination: input.destination,
      providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
      payloadSnapshot: payload.snapshot,
      payloadHash: payload.hash,
      status: input.status,
    });
    return id;
  }

  it('flags active renewing annual subscriptions inside the deadline that lack delivered notices', async () => {
    const renewal = new Date('2026-08-27T12:00:00.000Z');
    const flagged = await insertSubscription({ currentPeriodEnd: renewal });
    await insertSubscription({
      priceId: 'price_test_monthly',
      currentPeriodEnd: renewal,
    });
    await insertSubscription({ status: 'canceled', currentPeriodEnd: renewal });
    await insertSubscription({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: renewal,
    });
    await insertSubscription({
      currentPeriodEnd: new Date('2026-09-07T12:00:00.000Z'),
    });
    await insertSubscription({
      currentPeriodEnd: new Date('2026-08-06T12:00:00.000Z'),
    });

    await expect(
      listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
    ).resolves.toEqual([
      {
        externalSubscriptionId: flagged.externalSubscriptionId,
        renewalAt: renewal,
      },
    ]);
  });

  it('clears a renewal only when both notice kinds are delivered for that renewal', async () => {
    const renewal = new Date('2026-09-06T12:00:00.000Z');
    const subscription = await insertSubscription({
      currentPeriodEnd: renewal,
    });
    const notice = {
      externalSubscriptionId: subscription.externalSubscriptionId,
      applicableAt: renewal,
      destination: subscription.email,
    };
    await insertNotice({
      ...notice,
      noticeKind: 'annual_reminder',
      status: 'delivered',
    });
    const failedNoticeId = await insertNotice({
      ...notice,
      noticeKind: 'renewal_notice',
      status: 'terminal_failure',
    });
    // A delivered notice for an earlier renewal does not cover this one.
    await insertNotice({
      ...notice,
      applicableAt: new Date('2025-09-06T12:00:00.000Z'),
      noticeKind: 'renewal_notice',
      status: 'delivered',
    });

    await expect(
      listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
    ).resolves.toEqual([
      {
        externalSubscriptionId: subscription.externalSubscriptionId,
        renewalAt: renewal,
      },
    ]);

    // A failed notice is requeued in place, never duplicated; model its
    // eventual delivery on the same row.
    await db
      .update(renewalNoticeDeliveries)
      .set({ status: 'delivered' })
      .where(eq(renewalNoticeDeliveries.id, failedNoticeId));

    await expect(
      listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
    ).resolves.toEqual([]);
  });

  // #1155 review: dispatch refuses a notice whose destination is no longer the
  // account email (destination_changed), so a delivered notice reached the
  // address of record when it was sent. A later email change does not unmeet
  // the deadline; the scheduler resends to the new address only inside its
  // selection window.
  it('keeps counting notices delivered to the address of record after the email changes', async () => {
    const renewal = new Date('2026-09-06T12:00:00.000Z');
    const subscription = await insertSubscription({
      currentPeriodEnd: renewal,
    });
    for (const noticeKind of ['annual_reminder', 'renewal_notice'] as const) {
      await insertNotice({
        noticeKind,
        externalSubscriptionId: subscription.externalSubscriptionId,
        applicableAt: renewal,
        destination: subscription.email,
        status: 'delivered',
      });
    }

    await db
      .update(users)
      .set({ email: `changed-${randomUUID()}@example.test` })
      .where(eq(users.id, subscription.userId));

    await expect(
      listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
    ).resolves.toEqual([]);
  });
});
