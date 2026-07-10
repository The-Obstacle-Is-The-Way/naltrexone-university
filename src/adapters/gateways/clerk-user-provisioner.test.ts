import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { UpsertUserByClerkIdOptions } from '@/src/application/ports/repositories';
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

class ResolutionFailingUserRepository extends FakeUserRepository {
  private ownerSynchronized = false;

  constructor(
    private readonly incomingClerkUserId: string,
    private readonly resolutionError: Error,
  ) {
    super();
  }

  override async updateEmailByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ) {
    const updated = await super.updateEmailByClerkId(clerkId, email, options);
    this.ownerSynchronized = true;
    return updated;
  }

  override async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ) {
    if (clerkId === this.incomingClerkUserId && this.ownerSynchronized) {
      throw this.resolutionError;
    }
    return super.upsertByClerkId(clerkId, email, options);
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

  it('logs both Clerk IDs when the existing Clerk identity lookup fails', async () => {
    const lookupError = new Error('Clerk unavailable');
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    await userRepository.upsertByClerkId('clerk_owner', 'reused@example.com');

    await expect(
      ensureClerkUser(
        {
          userRepository,
          getClerkUserById: async () => {
            throw lookupError;
          },
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
          resolution: 'blocked_existing_identity_lookup_failed',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });

  it('fails closed when Clerk returns an unverifiable existing identity', async () => {
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    await userRepository.upsertByClerkId('clerk_owner', 'reused@example.com');

    await expect(
      ensureClerkUser(
        {
          userRepository,
          getClerkUserById: async () => ({
            id: 'clerk_different',
            updatedAt: new Date('2026-02-02T00:00:00.000Z'),
            emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
          }),
          logger,
        },
        {
          clerkUserId: 'clerk_incoming',
          email: 'reused@example.com',
          observedAt: new Date('2026-02-03T00:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'user_email_owned_by_another_identity' },
    });
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_existing_identity_unverifiable',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });

  it('fails closed when Clerk confirms the existing identity still owns the email', async () => {
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    await userRepository.upsertByClerkId('clerk_owner', 'reused@example.com');

    await expect(
      ensureClerkUser(
        {
          userRepository,
          getClerkUserById: async () => ({
            id: 'clerk_owner',
            updatedAt: new Date('2026-02-02T00:00:00.000Z'),
            emailAddresses: [{ emailAddress: 'reused@example.com' }],
          }),
          logger,
        },
        {
          clerkUserId: 'clerk_incoming',
          email: 'reused@example.com',
          observedAt: new Date('2026-02-03T00:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'user_email_owned_by_another_identity' },
    });
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_existing_identity_still_owns_email',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });

  it('fails closed when the stored owner email cannot be synchronized', async () => {
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    await userRepository.upsertByClerkId('clerk_owner', 'reused@example.com', {
      observedAt: new Date('2026-02-03T00:00:00.000Z'),
    });

    await expect(
      ensureClerkUser(
        {
          userRepository,
          getClerkUserById: async () => ({
            id: 'clerk_owner',
            updatedAt: new Date('2026-02-02T00:00:00.000Z'),
            emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
          }),
          logger,
        },
        {
          clerkUserId: 'clerk_incoming',
          email: 'reused@example.com',
          observedAt: new Date('2026-02-04T00:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'user_email_owned_by_another_identity' },
    });
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_existing_identity_email_not_synchronized',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });

  it('logs both Clerk IDs when the incoming upsert fails after owner synchronization', async () => {
    const resolutionError = new ApplicationError(
      'INTERNAL_ERROR',
      'incoming upsert failed',
    );
    const userRepository = new ResolutionFailingUserRepository(
      'clerk_incoming',
      resolutionError,
    );
    const logger = new FakeLogger();
    await userRepository.upsertByClerkId('clerk_owner', 'reused@example.com', {
      observedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    await expect(
      ensureClerkUser(
        {
          userRepository,
          getClerkUserById: async () => ({
            id: 'clerk_owner',
            updatedAt: new Date('2026-02-02T00:00:00.000Z'),
            emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
          }),
          logger,
        },
        {
          clerkUserId: 'clerk_incoming',
          email: 'reused@example.com',
          observedAt: new Date('2026-02-03T00:00:00.000Z'),
        },
      ),
    ).rejects.toBe(resolutionError);
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_identity_resolution_failed',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });
});
