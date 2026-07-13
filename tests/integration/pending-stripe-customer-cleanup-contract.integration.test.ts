import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePendingStripeCustomerCleanupRepository } from '@/src/adapters/repositories/drizzle-pending-stripe-customer-cleanup-repository';
import type { PendingStripeCustomerCleanupRepository } from '@/src/application/ports/repositories';
import { FakePendingStripeCustomerCleanupRepository } from '@/src/application/test-helpers/fakes';
import { closeConnection, createIntegrationDb } from './helpers';

const { db, sql } = createIntegrationDb();
const seededClerkEventIds: string[] = [];

afterEach(async () => {
  if (seededClerkEventIds.length > 0) {
    await db
      .delete(schema.clerkEvents)
      .where(inArray(schema.clerkEvents.id, seededClerkEventIds));
    seededClerkEventIds.length = 0;
  }
});

afterAll(async () => {
  await closeConnection(sql);
});

/**
 * Fake-fidelity contract: the same scenario table runs against the fake and
 * the real Postgres adapter and must observe identical outcomes, so a
 * fake-backed unit test can never certify anti-production semantics
 * (register precedents: DEBT-443 part 3, DEBT-451 part 4, DEBT-455).
 */
type ContractHarness = {
  repo: PendingStripeCustomerCleanupRepository;
  seed(
    eventId: string,
    stripeCustomerId: string,
    createdAt: Date,
  ): Promise<void>;
};

function createFakeHarness(): ContractHarness {
  let now = new Date(0);
  const repo = new FakePendingStripeCustomerCleanupRepository(() => now);
  return {
    repo,
    seed: async (eventId, stripeCustomerId, createdAt) => {
      now = createdAt;
      await repo.schedule(eventId, stripeCustomerId);
    },
  };
}

function createRealHarness(): ContractHarness {
  const repo = new DrizzlePendingStripeCustomerCleanupRepository(db);
  return {
    repo,
    seed: async (eventId, stripeCustomerId, createdAt) => {
      seededClerkEventIds.push(eventId);
      await db
        .insert(schema.clerkEvents)
        .values({ id: eventId, type: 'user.deleted', createdAt });
      await db
        .insert(schema.pendingStripeCancellations)
        .values({ eventId, stripeCustomerId, createdAt });
    },
  };
}

const harnesses = [
  ['fake', createFakeHarness],
  ['real Postgres', createRealHarness],
] as const;

describe.each(
  harnesses,
)('PendingStripeCustomerCleanupRepository contract (%s)', (_label, createHarness) => {
  const t0 = new Date('2026-06-12T12:00:00.000Z');
  const t1 = new Date('2026-06-12T12:01:00.000Z');
  const t2 = new Date('2026-06-12T12:02:00.000Z');
  const cutoffAfterAll = new Date('2026-06-12T12:15:00.000Z');

  it('finds a scheduled obligation by event id and deletes idempotently', async () => {
    const harness = createHarness();
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    await harness.seed(eventId, 'cus_contract', t0);

    await expect(harness.repo.findByEventId(eventId)).resolves.toEqual({
      stripeCustomerId: 'cus_contract',
    });

    await harness.repo.deleteByEventId(eventId);
    await expect(harness.repo.findByEventId(eventId)).resolves.toBeNull();
    await expect(
      harness.repo.deleteByEventId(eventId),
    ).resolves.toBeUndefined();
  });

  it('re-scheduling updates the customer id but preserves the staleness clock', async () => {
    const harness = createHarness();
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    await harness.seed(eventId, 'cus_first', t0);

    await harness.repo.schedule(eventId, 'cus_second');

    await expect(harness.repo.findByEventId(eventId)).resolves.toEqual({
      stripeCustomerId: 'cus_second',
    });
    const [row] = await harness.repo.listStale(cutoffAfterAll, 10);
    expect(row).toEqual({
      eventId,
      stripeCustomerId: 'cus_second',
      createdAt: t0,
    });
  });

  it('lists stale rows oldest-first with cutoff, limit, and exclusions', async () => {
    const harness = createHarness();
    const eventA = `evt_${randomUUID().replaceAll('-', '')}`;
    const eventB = `evt_${randomUUID().replaceAll('-', '')}`;
    const eventC = `evt_${randomUUID().replaceAll('-', '')}`;
    await harness.seed(eventB, 'cus_b', t1);
    await harness.seed(eventA, 'cus_a', t0);
    await harness.seed(eventC, 'cus_c', t2);

    const ordered = await harness.repo.listStale(cutoffAfterAll, 10);
    expect(ordered.map((row) => row.eventId)).toEqual([eventA, eventB, eventC]);

    const limited = await harness.repo.listStale(cutoffAfterAll, 2);
    expect(limited.map((row) => row.eventId)).toEqual([eventA, eventB]);

    const excluded = await harness.repo.listStale(cutoffAfterAll, 2, [eventA]);
    expect(excluded.map((row) => row.eventId)).toEqual([eventB, eventC]);

    const cutoffBetween = await harness.repo.listStale(
      new Date(t1.getTime() + 1),
      10,
    );
    expect(cutoffBetween.map((row) => row.eventId)).toEqual([eventA, eventB]);
  });
});
