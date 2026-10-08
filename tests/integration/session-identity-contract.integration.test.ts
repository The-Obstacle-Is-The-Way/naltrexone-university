import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ClerkAuthGateway } from '@/src/adapters/gateways/clerk-auth-gateway';
import { DrizzleDeletedClerkUserRepository } from '@/src/adapters/repositories/drizzle-deleted-clerk-user-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { runSessionIdentityContract } from '@/tests/shared/session-identity-contract';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

vi.mock('server-only', () => ({}));

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const tombstonedClerkUserIds: string[] = [];

function newClerkUserId(): string {
  const clerkUserId = `clerk_${crypto.randomUUID()}`;
  tombstonedClerkUserIds.push(clerkUserId);
  return clerkUserId;
}

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
  if (tombstonedClerkUserIds.length > 0) {
    await db
      .delete(schema.deletedClerkUsers)
      .where(
        inArray(schema.deletedClerkUsers.clerkUserId, tombstonedClerkUserIds),
      );
    tombstonedClerkUserIds.length = 0;
  }
});

afterAll(async () => {
  await closeConnection(sql);
});

runSessionIdentityContract('Postgres repositories', async () => ({
  userRepository: new DrizzleUserRepository(db),
  deletedClerkUsers: new DrizzleDeletedClerkUserRepository(db),
  clerkUserId: newClerkUserId(),
  track: (userId) => cleanup.userIds.push(userId),
}));

// BUG-320: a new user's first page can arrive as several requests at once,
// each on its own database connection. The Clerk lookup holds every request
// until all six have arrived, so none can write before all six have found no
// row; the six then provision at once. Provisioning must still end with
// exactly one row, and no request may fail. One round misses the race most
// of the time, so the test runs a hundred: with BUG-320's retry removed, it
// failed in each of five runs.
describe('session identity on Postgres', () => {
  it('provisions one row for six concurrent first requests on separate connections', async () => {
    const requests = 6;
    const sessions = Array.from({ length: requests }, () =>
      createIntegrationDb(),
    );
    try {
      await Promise.all(sessions.map((session) => session.sql`select 1`));
      for (let round = 0; round < 100; round += 1) {
        const clerkUserId = newClerkUserId();
        const email = `${clerkUserId}@example.com`;
        const allArrived = createDeferred<void>();
        let arrived = 0;
        const lookup = async (id: string) => {
          arrived += 1;
          if (arrived === requests) allArrived.resolve();
          await allArrived.promise;
          return {
            id,
            updatedAt: Date.parse('2026-02-02T00:00:00Z'),
            emailAddresses: [{ emailAddress: email }],
          };
        };

        const results = await Promise.allSettled(
          sessions.map((session) =>
            new ClerkAuthGateway({
              userRepository: new DrizzleUserRepository(session.db),
              deletedClerkUsers: new DrizzleDeletedClerkUserRepository(
                session.db,
              ),
              getSessionClerkUserId: async () => clerkUserId,
              getClerkUserById: lookup,
              logger: new FakeLogger(),
            }).requireUser(),
          ),
        );
        const rows = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(inArray(schema.users.clerkUserId, [clerkUserId]));
        cleanup.userIds.push(...rows.map(({ id }) => id));

        expect(
          results.flatMap((result) =>
            result.status === 'rejected' ? [String(result.reason)] : [],
          ),
        ).toEqual([]);
        expect(rows).toHaveLength(1);
      }
    } finally {
      await Promise.all(
        sessions.map((session) => closeConnection(session.sql)),
      );
    }
  });
});
