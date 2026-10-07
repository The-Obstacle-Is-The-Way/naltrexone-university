import { describe, expect, it } from 'vitest';
import {
  ClerkAuthGateway,
  type ClerkUserLike,
} from '@/src/adapters/gateways/clerk-auth-gateway';
import type {
  DeletedClerkUserRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

// DEBT-503 item 1: a signed-in request reads our own row and the deletion
// tombstone, and asks Clerk only to provision a missing row. These scenarios
// run the real gateway over the maintained fakes and over Postgres, so both
// agree on what a session resolves to and on when Clerk is asked.

export type SessionIdentityHarness = {
  userRepository: UserRepository;
  deletedClerkUsers: DeletedClerkUserRepository;
  /** A Clerk user ID unique to this test, so real-database runs never collide. */
  clerkUserId: string;
  /** Records a row created through the harness for cleanup. */
  track(userId: string): void;
};

function lookupAnswering(answer: ClerkUserLike | null) {
  const calls: string[] = [];
  return {
    calls,
    lookup: async (clerkUserId: string) => {
      calls.push(clerkUserId);
      return answer;
    },
  };
}

function gatewayFor(
  harness: SessionIdentityHarness,
  lookup: (clerkUserId: string) => Promise<ClerkUserLike | null>,
) {
  return new ClerkAuthGateway({
    userRepository: harness.userRepository,
    deletedClerkUsers: harness.deletedClerkUsers,
    getSessionClerkUserId: async () => harness.clerkUserId,
    getClerkUserById: lookup,
    logger: new FakeLogger(),
  });
}

export function runSessionIdentityContract(
  name: string,
  createHarness: () => Promise<SessionIdentityHarness>,
): void {
  describe(`${name} session identity contract`, () => {
    it('serves an existing row with no Clerk call', async () => {
      const harness = await createHarness();
      const row = await harness.userRepository.upsertByClerkId(
        harness.clerkUserId,
        `${harness.clerkUserId}@example.com`,
      );
      harness.track(row.id);
      const { lookup, calls } = lookupAnswering(null);

      await expect(
        gatewayFor(harness, lookup).getCurrentUser(),
      ).resolves.toMatchObject({ id: row.id });
      expect(calls).toEqual([]);
    });

    it('returns no user for a tombstoned session, and asks Clerk nothing', async () => {
      const harness = await createHarness();
      const { lookup, calls } = lookupAnswering(null);
      await harness.deletedClerkUsers.markDeleted(harness.clerkUserId);

      await expect(
        gatewayFor(harness, lookup).getCurrentUser(),
      ).resolves.toBeNull();
      expect(calls).toEqual([]);
    });

    it("does not serve a tombstoned user's leftover row", async () => {
      const harness = await createHarness();
      const leftover = await harness.userRepository.upsertByClerkId(
        harness.clerkUserId,
        `${harness.clerkUserId}@example.com`,
      );
      harness.track(leftover.id);
      await harness.deletedClerkUsers.markDeleted(harness.clerkUserId);
      const { lookup, calls } = lookupAnswering(null);

      await expect(
        gatewayFor(harness, lookup).getCurrentUser(),
      ).resolves.toBeNull();
      expect(calls).toEqual([]);
    });

    it('provisions a missing row with one Clerk lookup', async () => {
      const harness = await createHarness();
      const email = `${harness.clerkUserId}@example.com`;
      const { lookup, calls } = lookupAnswering({
        id: harness.clerkUserId,
        updatedAt: Date.parse('2026-02-02T00:00:00Z'),
        emailAddresses: [{ emailAddress: email }],
      });

      const user = await gatewayFor(harness, lookup).requireUser();
      harness.track(user.id);

      expect(user).toMatchObject({ email });
      expect(calls).toEqual([harness.clerkUserId]);
      await expect(
        harness.userRepository.findByClerkId(harness.clerkUserId),
      ).resolves.toMatchObject({ email });
    });

    it('creates no row when Clerk no longer has the session user', async () => {
      const harness = await createHarness();
      const { lookup } = lookupAnswering(null);

      await expect(
        gatewayFor(harness, lookup).getCurrentUser(),
      ).resolves.toBeNull();
      await expect(
        harness.userRepository.findByClerkId(harness.clerkUserId),
      ).resolves.toBeNull();
    });
  });
}
