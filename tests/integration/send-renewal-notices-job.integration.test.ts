import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { renewalNoticeDeliveries, stripeSubscriptions } from '@/db/schema';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { listAnnualSubscriptionsDue } from '@/src/adapters/jobs/send-due-renewal-notices';
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
});
