import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
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

// BUG-320: a new user's first page can arrive as several requests at once.
// The Clerk lookup holds every request until all six have arrived, so none
// can write before all six have found no row; the six then provision at once.
// Provisioning must still end with exactly one row, and no request may fail.
describe('session identity on Postgres', () => {
  it('provisions one row for six concurrent first requests', async () => {
    const requests = 6;
    const clerkUserId = newClerkUserId();
    const email = `${clerkUserId}@example.com`;
    const allArrived = createDeferred<void>();
    let arrived = 0;
    const gateway = new ClerkAuthGateway({
      userRepository: new DrizzleUserRepository(db),
      deletedClerkUsers: new DrizzleDeletedClerkUserRepository(db),
      getSessionClerkUserId: async () => clerkUserId,
      getClerkUserById: async (id) => {
        arrived += 1;
        if (arrived === requests) allArrived.resolve();
        await allArrived.promise;
        return {
          id,
          updatedAt: Date.parse('2026-02-02T00:00:00Z'),
          emailAddresses: [{ emailAddress: email }],
        };
      },
      logger: new FakeLogger(),
    });

    const users = await Promise.all(
      Array.from({ length: requests }, () => gateway.requireUser()),
    );
    for (const user of users) cleanup.userIds.push(user.id);

    expect(new Set(users.map((user) => user.id)).size).toBe(1);
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.clerkUserId, [clerkUserId]));
    expect(rows).toHaveLength(1);
  });
});
