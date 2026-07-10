import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import { ensureClerkUser } from './clerk-user-provisioner';

class IncomingLookupFailingUserRepository extends FakeUserRepository {
  constructor(
    private readonly failingClerkUserId: string,
    private readonly lookupError: Error,
  ) {
    super();
  }

  override async findByClerkId(clerkId: string) {
    if (clerkId === this.failingClerkUserId) throw this.lookupError;
    return super.findByClerkId(clerkId);
  }
}

describe('ensureClerkUser', () => {
  it('logs both Clerk IDs when checking the incoming local identity fails', async () => {
    const lookupError = new Error('database unavailable');
    const userRepository = new IncomingLookupFailingUserRepository(
      'clerk_incoming',
      lookupError,
    );
    const logger = new FakeLogger();
    await userRepository.upsertByClerkId('clerk_owner', 'reused@example.com');

    await expect(
      ensureClerkUser(
        {
          userRepository,
          getClerkUserById: async () => null,
          logger,
        },
        {
          clerkUserId: 'clerk_incoming',
          email: 'reused@example.com',
          observedAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      ),
    ).rejects.toBe(lookupError);
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_incoming_identity_lookup_failed',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });
});
