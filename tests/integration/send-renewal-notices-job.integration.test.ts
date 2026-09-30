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
  listActiveMonthlySubscriptions,
  listAnniversaryReminders,
  listAnnualRenewalsPastNoticeDeadline,
  listAnnualSubscriptionsDue,
} from '@/src/adapters/jobs/send-due-renewal-notices';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import { getPostgresErrorCode } from '@/src/adapters/repositories/postgres-errors';
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
    status: 'queued' | 'accepted' | 'delivered' | 'terminal_failure';
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

  it('clears a renewal only when both notice kinds were sent for that renewal', async () => {
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
      status: 'accepted',
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
    // eventual delivery evidence on the same row. Acceptance (above) and
    // delivery evidence both count as sent.
    await db
      .update(renewalNoticeDeliveries)
      .set({ status: 'delivered' })
      .where(eq(renewalNoticeDeliveries.id, failedNoticeId));

    await expect(
      listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
    ).resolves.toEqual([]);
  });

  // DEBT-414 F07: a notice the provider reports it could not deliver was not
  // given, whether it was only accepted or already reported delivered.
  it.each(
    (
      [
        'provider_bounced',
        'provider_send_failed',
        'provider_suppressed',
      ] as const
    ).flatMap((failureClass) => [
      [failureClass, 'accepted'] as const,
      [failureClass, 'delivered'] as const,
    ]),
  )(
    'flags a renewal again once the provider reports %s of its %s notice',
    async (failureClass, noticeStatus) => {
      const renewal = new Date('2026-09-06T12:00:00.000Z');
      const subscription = await insertSubscription({
        currentPeriodEnd: renewal,
      });
      const notice = {
        externalSubscriptionId: subscription.externalSubscriptionId,
        applicableAt: renewal,
        destination: subscription.email,
        status: noticeStatus,
      } as const;
      const reminderId = await insertNotice({
        ...notice,
        noticeKind: 'annual_reminder',
      });
      await insertNotice({ ...notice, noticeKind: 'renewal_notice' });
      const providerEventId = `email_${randomUUID()}`;
      await db
        .update(renewalNoticeDeliveries)
        .set({ providerEventId })
        .where(eq(renewalNoticeDeliveries.id, reminderId));
      await expect(
        listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
      ).resolves.toEqual([]);

      await new DrizzleRenewalNoticeDeliveryRepository(
        db,
        hasher,
        () => now,
      ).recordProviderOutcome({
        providerEventId,
        outcome: { kind: 'failed', failureClass, failureCode: 'code' },
        observedAt: now,
      });

      await expect(
        listAnnualRenewalsPastNoticeDeadline(window, { db, annualPriceId }),
      ).resolves.toEqual([
        {
          externalSubscriptionId: subscription.externalSubscriptionId,
          renewalAt: renewal,
        },
      ]);
    },
  );

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

// DEBT-414 F02: the reads behind monthly subscribers' yearly reminders.
describe('monthly anniversary queries', () => {
  async function insertMonthly(input: {
    monthlyPriceId: string;
    idPrefix: string;
    status?: 'active' | 'canceled';
    priceId?: string;
    cancelAtPeriodEnd?: boolean;
    anchor?: Date | null;
  }) {
    const user = await createUser(db, cleanup);
    const externalSubscriptionId = `sub_${input.idPrefix}_${randomUUID().replaceAll('-', '')}`;
    const anchor =
      input.anchor === undefined
        ? new Date('2025-09-10T12:00:00.000Z')
        : input.anchor;
    await db.insert(stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: externalSubscriptionId,
      status: input.status ?? 'active',
      priceId: input.priceId ?? input.monthlyPriceId,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: new Date('2026-09-10T12:00:00.000Z'),
      startedAt: anchor,
      billingCycleAnchor: anchor,
    });
    return { externalSubscriptionId, email: user.email, anchor };
  }

  it('lists active, renewing monthly subscriptions in id order, after a cursor', async () => {
    const monthlyPriceId = `price_monthly_${randomUUID()}`;
    const first = await insertMonthly({ monthlyPriceId, idPrefix: 'a' });
    const unknown = await insertMonthly({
      monthlyPriceId,
      idPrefix: 'b',
      anchor: null,
    });
    await insertMonthly({ monthlyPriceId, idPrefix: 'c', status: 'canceled' });
    await insertMonthly({
      monthlyPriceId,
      idPrefix: 'd',
      cancelAtPeriodEnd: true,
    });
    await insertMonthly({
      monthlyPriceId,
      idPrefix: 'e',
      priceId: `price_annual_${randomUUID()}`,
    });

    await expect(
      listActiveMonthlySubscriptions(
        { afterExternalSubscriptionId: null, limit: 10 },
        { db, monthlyPriceId },
      ),
    ).resolves.toEqual([
      {
        externalSubscriptionId: first.externalSubscriptionId,
        destination: first.email,
        startedAt: first.anchor,
        billingCycleAnchor: first.anchor,
      },
      {
        externalSubscriptionId: unknown.externalSubscriptionId,
        destination: unknown.email,
        startedAt: null,
        billingCycleAnchor: null,
      },
    ]);
    await expect(
      listActiveMonthlySubscriptions(
        {
          afterExternalSubscriptionId: first.externalSubscriptionId,
          limit: 10,
        },
        { db, monthlyPriceId },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        externalSubscriptionId: unknown.externalSubscriptionId,
      }),
    ]);
  });

  it('lists stored anniversary reminders in every status, and stores the kind once per renewal', async () => {
    const monthlyPriceId = `price_monthly_${randomUUID()}`;
    const subscription = await insertMonthly({ monthlyPriceId, idPrefix: 's' });
    const renewal = new Date('2026-09-10T12:00:00.000Z');
    const insert = async (input: {
      status: 'queued' | 'accepted' | 'delivered';
      applicableAt: Date;
      noticeKind?: 'anniversary_reminder' | 'annual_reminder';
    }) => {
      const id = randomUUID();
      deliveryIds.push(id);
      const payload = createTransactionalEmailPayloadSnapshot(
        {
          from: 'Addiction Boards <notices@addictionboards.com>',
          to: subscription.email,
          replyTo: 'support@addictionboards.com',
          subject: 'Yearly reminder',
          html: '<p>Yearly reminder</p>',
          text: 'Yearly reminder',
        },
        hasher,
      );
      await db.insert(renewalNoticeDeliveries).values({
        id,
        noticeKind: input.noticeKind ?? 'anniversary_reminder',
        consentRecordId: null,
        stripeSubscriptionId: subscription.externalSubscriptionId,
        applicableAt: input.applicableAt,
        disclosureVersion: '2026-09-27',
        destination: subscription.email,
        providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
        payloadSnapshot: payload.snapshot,
        payloadHash: payload.hash,
        status: input.status,
      });
    };
    await insert({ status: 'accepted', applicableAt: renewal });
    await insert({
      status: 'delivered',
      applicableAt: new Date('2025-09-10T12:00:00.000Z'),
    });
    await insert({
      status: 'queued',
      applicableAt: new Date('2027-09-10T12:00:00.000Z'),
    });
    await insert({
      status: 'accepted',
      applicableAt: renewal,
      noticeKind: 'annual_reminder',
    });

    const stored = await listAnniversaryReminders(
      { externalSubscriptionIds: [subscription.externalSubscriptionId] },
      { db },
    );
    // Every stored anniversary reminder, in any status and any year, with
    // the keys scheduling matches on; never another kind.
    expect(
      stored
        .map(
          (reminder) =>
            `${reminder.applicableAt.toISOString()} ${reminder.status} ${reminder.disclosureVersion} ${reminder.destination === subscription.email}`,
        )
        .sort(),
    ).toEqual([
      '2025-09-10T12:00:00.000Z delivered 2026-09-27 true',
      '2026-09-10T12:00:00.000Z accepted 2026-09-27 true',
      '2027-09-10T12:00:00.000Z queued 2026-09-27 true',
    ]);
    await expect(
      listAnniversaryReminders({ externalSubscriptionIds: [] }, { db }),
    ).resolves.toEqual([]);

    // The scheduled-notice unique index covers the new kind.
    const duplicate = await insert({
      status: 'queued',
      applicableAt: renewal,
    }).catch((error: unknown) => error);
    expect(getPostgresErrorCode(duplicate)).toBe('23505');
  });
});
