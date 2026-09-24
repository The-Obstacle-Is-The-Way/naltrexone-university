import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { clerkEvents, deletedClerkUsers } from '@/db/schema';
import { DrizzleClerkEventRepository } from '@/src/adapters/repositories/drizzle-clerk-event-repository';
import { DrizzleDeletedClerkUserRepository } from '@/src/adapters/repositories/drizzle-deleted-clerk-user-repository';
import { closeConnection, createIntegrationDb } from './helpers';

// Real-Postgres twins for the retired Clerk event and tombstone chain units.
const { db, sql } = createIntegrationDb();
// A second session for lock probes; the pooled client above holds a single
// connection that the transaction under test reserves.
const lockProbe = createIntegrationDb();
const eventIds: string[] = [];
const clerkUserIds: string[] = [];

function newEventId(): string {
  const id = `evt_${randomUUID().replaceAll('-', '')}`;
  eventIds.push(id);
  return id;
}

function newClerkUserId(): string {
  const id = `user_${randomUUID().replaceAll('-', '')}`;
  clerkUserIds.push(id);
  return id;
}

afterEach(async () => {
  if (eventIds.length > 0) {
    await db.delete(clerkEvents).where(inArray(clerkEvents.id, eventIds));
  }
  eventIds.length = 0;
  if (clerkUserIds.length > 0) {
    await db
      .delete(deletedClerkUsers)
      .where(inArray(deletedClerkUsers.clerkUserId, clerkUserIds));
  }
  clerkUserIds.length = 0;
});

afterAll(async () => {
  await closeConnection(lockProbe.sql);
  await closeConnection(sql);
});

describe('DrizzleClerkEventRepository', () => {
  it('claims a new event once and reports later claims as duplicates', async () => {
    const repo = new DrizzleClerkEventRepository(db);
    const eventId = newEventId();

    await expect(repo.claim(eventId, 'user.updated')).resolves.toBe(true);
    await expect(repo.claim(eventId, 'user.updated')).resolves.toBe(false);
    await expect(repo.peek(eventId)).resolves.toEqual({
      processedAt: null,
      error: null,
    });
  });

  it('returns null from peek for an unknown event', async () => {
    const repo = new DrizzleClerkEventRepository(db);

    await expect(repo.peek(`evt_${randomUUID()}`)).resolves.toBeNull();
  });

  it('locks an existing event FOR UPDATE inside a transaction and rejects a missing one', async () => {
    const repo = new DrizzleClerkEventRepository(db);
    const eventId = newEventId();
    await repo.claim(eventId, 'user.deleted');

    await db.transaction(async (tx) => {
      const txRepo = new DrizzleClerkEventRepository(tx);
      await expect(txRepo.lock(eventId)).resolves.toEqual({
        processedAt: null,
        error: null,
      });
      // Only FOR UPDATE blocks a concurrent FOR KEY SHARE on the row.
      await expect(
        lockProbe.sql`
          select id from clerk_events where id = ${eventId} for key share nowait
        `,
      ).rejects.toMatchObject({ code: '55P03' });
      await expect(txRepo.lock(`evt_${randomUUID()}`)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  it('marks an event failed, then processed with the injected clock and a cleared error', async () => {
    const processedAt = new Date('2026-02-01T00:00:00.000Z');
    const repo = new DrizzleClerkEventRepository(db, () => processedAt);
    const eventId = newEventId();
    await repo.claim(eventId, 'user.updated');

    await repo.markFailed(eventId, 'boom');
    await expect(repo.peek(eventId)).resolves.toEqual({
      processedAt: null,
      error: 'boom',
    });

    await repo.markProcessed(eventId);
    await expect(repo.peek(eventId)).resolves.toEqual({
      processedAt,
      error: null,
    });
  });

  it('throws NOT_FOUND when marking an unknown event processed or failed', async () => {
    const repo = new DrizzleClerkEventRepository(db);
    const missing = `evt_${randomUUID()}`;

    await expect(repo.markProcessed(missing)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(repo.markFailed(missing, 'boom')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('DrizzleDeletedClerkUserRepository', () => {
  it('records a tombstone idempotently and reports its existence', async () => {
    const repo = new DrizzleDeletedClerkUserRepository(db);
    const clerkUserId = newClerkUserId();

    await expect(repo.exists(clerkUserId)).resolves.toBe(false);
    await repo.markDeleted(clerkUserId);
    await expect(repo.exists(clerkUserId)).resolves.toBe(true);
    await expect(repo.markDeleted(clerkUserId)).resolves.toBeUndefined();
    await expect(
      db
        .select({ clerkUserId: deletedClerkUsers.clerkUserId })
        .from(deletedClerkUsers)
        .where(eq(deletedClerkUsers.clerkUserId, clerkUserId)),
    ).resolves.toHaveLength(1);
  });

  it('stores an explicit deletedAt and otherwise the database default', async () => {
    const repo = new DrizzleDeletedClerkUserRepository(db);
    const explicitId = newClerkUserId();
    const defaultId = newClerkUserId();
    const explicitDeletedAt = new Date('2026-01-15T12:00:00.000Z');
    const before = new Date(Date.now() - 60_000);

    await repo.markDeleted(explicitId, explicitDeletedAt);
    await repo.markDeleted(defaultId);

    const rows = await db
      .select({
        clerkUserId: deletedClerkUsers.clerkUserId,
        deletedAt: deletedClerkUsers.deletedAt,
      })
      .from(deletedClerkUsers)
      .where(inArray(deletedClerkUsers.clerkUserId, [explicitId, defaultId]));
    const byId = new Map(rows.map((row) => [row.clerkUserId, row.deletedAt]));
    expect(byId.get(explicitId)).toEqual(explicitDeletedAt);
    expect(byId.get(defaultId)?.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it('holds a transaction-scoped advisory lock keyed by the Clerk user id until commit', async () => {
    const clerkUserId = newClerkUserId();
    // pg_advisory_xact_lock(bigint) exposes its key as classid (high 32 bits)
    // and objid (low 32 bits) with objsubid 1; hashtextextended(id, 0) is the key.
    // Filtering on a granted ExclusiveLock keeps a shared-lock regression red.
    const heldTombstoneLocks = (pid: number) => drizzleSql<{ held: number }>`
      select count(*)::int as held
      from pg_locks
      where locktype = 'advisory'
        and pid = ${pid}
        and objsubid = 1
        and mode = 'ExclusiveLock'
        and granted
        and classid::bigint = ((hashtextextended(${clerkUserId}, 0) >> 32) & 4294967295)
        and objid::bigint = (hashtextextended(${clerkUserId}, 0) & 4294967295)
    `;

    const backendPid = await db.transaction(async (tx) => {
      const txRepo = new DrizzleDeletedClerkUserRepository(tx);
      const [backend] = await tx.execute<{ pid: number }>(
        drizzleSql`select pg_backend_pid() as pid`,
      );
      if (!backend) throw new Error('Expected a backend pid');

      await expect(txRepo.lock(clerkUserId)).resolves.toBeUndefined();

      const [inside] = await tx.execute(heldTombstoneLocks(backend.pid));
      expect(inside).toEqual({ held: 1 });
      return backend.pid;
    });

    const [outside] = await db.execute(heldTombstoneLocks(backendPid));
    expect(outside).toEqual({ held: 0 });
  });
});
