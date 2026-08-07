import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { stripeSubscriptions } from '@/db/schema';
import { listAnnualSubscriptionsDue } from '@/src/adapters/jobs/send-due-renewal-notices';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
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
});
