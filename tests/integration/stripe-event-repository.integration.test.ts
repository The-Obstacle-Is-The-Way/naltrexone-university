import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { stripeEvents } from '@/db/schema';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { ApplicationError } from '@/src/application/errors';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const lockHolder = createIntegrationDb();
const cleanup = createCleanupState();
const processedAt = new Date('1999-12-30T00:00:00Z');
const cutoff = new Date('2000-01-01T00:00:00Z');

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(lockHolder.sql);
  await closeConnection(sql);
});

async function seedEvent(state: {
  processedAt: Date | null;
  error: string | null;
}) {
  const id = `evt_${randomUUID().replaceAll('-', '')}`;
  cleanup.stripeEventIds.push(id);
  await db.insert(stripeEvents).values({
    id,
    type: 'checkout.session.completed',
    ...state,
  });
  return id;
}

describe('Stripe event reads and writes against real Postgres', () => {
  it('claims an event once without overwriting its type or processed state on replay', async () => {
    const id = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(id);
    const repo = new DrizzleStripeEventRepository(db, () => processedAt);

    await expect(repo.claim(id, 'checkout.session.completed')).resolves.toBe(
      true,
    );
    await repo.markProcessed(id);
    await expect(repo.claim(id, 'customer.subscription.updated')).resolves.toBe(
      false,
    );

    const [row] = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, id));
    expect(row).toMatchObject({
      id,
      type: 'checkout.session.completed',
      processedAt,
      error: null,
    });
  });

  it.each([
    { name: 'pending', state: { processedAt: null, error: null } },
    { name: 'processed', state: { processedAt, error: null } },
    { name: 'failed', state: { processedAt: null, error: 'delivery failed' } },
  ])('peeks the requested $name event', async ({ state }) => {
    await seedEvent({ processedAt: cutoff, error: 'unrelated event' });
    const id = await seedEvent(state);
    const repo = new DrizzleStripeEventRepository(db);

    await expect(repo.peek(id)).resolves.toEqual(state);
  });

  it('returns null when the requested peek event is missing', async () => {
    await seedEvent({ processedAt, error: null });
    const repo = new DrizzleStripeEventRepository(db);

    await expect(repo.peek(`evt_missing_${randomUUID()}`)).resolves.toBeNull();
  });

  it('peeks an event while another transaction holds its row lock', async () => {
    const id = await seedEvent({ processedAt, error: null });
    const repo = new DrizzleStripeEventRepository(db);
    await sql`set lock_timeout = '1s'`;

    try {
      await lockHolder.sql.begin(async (tx) => {
        await tx`select id from stripe_events where id = ${id} for update`;
        await expect(repo.peek(id)).resolves.toEqual({
          processedAt,
          error: null,
        });
      });
    } finally {
      await sql`reset lock_timeout`;
    }
  });

  it.each([
    { name: 'pending', state: { processedAt: null, error: null } },
    { name: 'failed', state: { processedAt: null, error: 'delivery failed' } },
  ])(
    'holds the $name event lock until its transaction ends',
    async ({ state }) => {
      const id = await seedEvent(state);
      const [holder] = await sql<
        { pid: number }[]
      >`select pg_backend_pid() as pid`;
      const [waiter] = await lockHolder.sql<
        { pid: number }[]
      >`select pg_backend_pid() as pid`;
      if (!holder || !waiter) throw new Error('Missing event lock backend pid');
      await lockHolder.sql`set lock_timeout = '3s'`;

      try {
        const { competingLock } = await db.transaction(async (tx) => {
          const repo = new DrizzleStripeEventRepository(tx);
          await expect(repo.lock(id)).resolves.toEqual(state);
          const competingLock = lockHolder.db
            .transaction((waitingTx) =>
              new DrizzleStripeEventRepository(waitingTx).lock(id),
            )
            .then(
              (lockedState) => ({ state: lockedState }),
              (error: unknown) => ({ error }),
            );
          await expect
            .poll(
              async () => {
                const [row] = await tx.execute<{ waiting: boolean }>(
                  drizzleSql`select ${holder.pid} = any(pg_blocking_pids(${waiter.pid})) as waiting`,
                );
                return row?.waiting;
              },
              { timeout: 2_000 },
            )
            .toBe(true);
          return { competingLock };
        });

        await expect(competingLock).resolves.toEqual({ state });
      } finally {
        await lockHolder.sql`reset lock_timeout`;
      }
    },
  );

  it.each(['lock', 'markProcessed', 'markFailed'] as const)(
    'rejects a missing event in %s with NOT_FOUND',
    async (operation) => {
      const repo = new DrizzleStripeEventRepository(db);
      const id = `evt_missing_${randomUUID()}`;
      const promise =
        operation === 'markFailed'
          ? repo.markFailed(id, 'delivery failed')
          : repo[operation](id);

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
    },
  );

  it('marks only the requested event processed and clears its prior error', async () => {
    const state = { processedAt: null, error: 'delivery failed' };
    const otherId = await seedEvent(state);
    const id = await seedEvent(state);
    const repo = new DrizzleStripeEventRepository(db, () => processedAt);

    await repo.markProcessed(id);

    await expect(repo.peek(id)).resolves.toEqual({ processedAt, error: null });
    await expect(repo.peek(otherId)).resolves.toEqual(state);
  });

  it('marks only the requested event failed and clears its processed timestamp', async () => {
    const state = { processedAt, error: null };
    const otherId = await seedEvent(state);
    const id = await seedEvent(state);
    const repo = new DrizzleStripeEventRepository(db);

    await repo.markFailed(id, 'retry failed');

    await expect(repo.peek(id)).resolves.toEqual({
      processedAt: null,
      error: 'retry failed',
    });
    await expect(repo.peek(otherId)).resolves.toEqual(state);
  });
});

describe('Stripe event pruning against real Postgres', () => {
  it.each([0, -1, 1.5])(
    'returns zero without opening a transaction for invalid limit %s',
    async (limit) => {
      const transaction = vi.spyOn(db, 'transaction');
      const repo = new DrizzleStripeEventRepository(db);

      await expect(repo.pruneProcessedBefore(cutoff, limit)).resolves.toBe(0);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('deletes oldest processed events within the batch limit and strict cutoff', async () => {
    const pending = await seedEvent({ processedAt: null, error: null });
    const failed = await seedEvent({
      processedAt: null,
      error: 'retry needed',
    });
    const boundary = await seedEvent({ processedAt: cutoff, error: null });
    const fresh = await seedEvent({
      processedAt: new Date('2000-01-02T00:00:00Z'),
      error: null,
    });
    // Insert out of timestamp order so a missing ORDER BY changes the batch.
    const newestExpired = await seedEvent({ processedAt, error: null });
    const oldest = await seedEvent({
      processedAt: new Date('1999-12-28T00:00:00Z'),
      error: null,
    });
    const nextOldest = await seedEvent({
      processedAt: new Date('1999-12-29T00:00:00Z'),
      error: null,
    });
    const repo = new DrizzleStripeEventRepository(db);

    await expect(repo.pruneProcessedBefore(cutoff, 2)).resolves.toBe(2);
    const remaining = await db
      .select({ id: stripeEvents.id })
      .from(stripeEvents)
      .where(inArray(stripeEvents.id, [oldest, nextOldest, newestExpired]));
    expect(remaining.map((row) => row.id)).toEqual([newestExpired]);
    await expect(repo.pruneProcessedBefore(cutoff, 10)).resolves.toBe(1);
    const preserved = await db
      .select({ id: stripeEvents.id })
      .from(stripeEvents)
      .where(inArray(stripeEvents.id, cleanup.stripeEventIds));
    expect(preserved.map((row) => row.id).sort()).toEqual(
      [pending, failed, boundary, fresh].sort(),
    );
  });

  it('returns zero when no processed event is older than the cutoff', async () => {
    const id = await seedEvent({ processedAt: cutoff, error: null });
    const repo = new DrizzleStripeEventRepository(db);

    await expect(repo.pruneProcessedBefore(cutoff, 10)).resolves.toBe(0);
    await expect(repo.peek(id)).resolves.toEqual({
      processedAt: cutoff,
      error: null,
    });
  });

  it('preserves a selected event refreshed before the delete acquires its lock', async () => {
    const id = await seedEvent({ processedAt, error: null });
    const repo = new DrizzleStripeEventRepository(db);
    const [backend] = await sql<
      { pid: number }[]
    >`select pg_backend_pid() as pid`;
    if (!backend) throw new Error('Missing pruning backend pid');
    await sql`set lock_timeout = '3s'`;

    try {
      const { pruning } = await lockHolder.sql.begin(async (tx) => {
        await tx`update stripe_events set processed_at = ${cutoff.toISOString()} where id = ${id}`;
        // Attach rejection handling immediately; a failed lock-wait assertion
        // rolls back the holder and still cannot leave an unhandled rejection.
        const pruning = repo.pruneProcessedBefore(cutoff, 1).then(
          (count) => ({ count }),
          (error: unknown) => ({ error }),
        );
        await expect
          .poll(
            async () => {
              const [row] = await tx<{ waiting: boolean }[]>`
            select cardinality(pg_blocking_pids(${backend.pid})) > 0 as waiting
          `;
              return row?.waiting;
            },
            { timeout: 2_000 },
          )
          .toBe(true);
        return { pruning };
      });

      await expect(pruning).resolves.toEqual({ count: 0 });
      const [row] = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, id));
      expect(row?.processedAt).toEqual(cutoff);
    } finally {
      await sql`reset lock_timeout`;
    }
  });
});
