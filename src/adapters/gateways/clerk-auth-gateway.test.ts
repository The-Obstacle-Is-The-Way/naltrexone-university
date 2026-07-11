import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeLogger,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import {
  ClerkAuthGateway,
  type ClerkAuthGatewayDeps,
} from './clerk-auth-gateway';

function createGateway(
  deps: Pick<ClerkAuthGatewayDeps, 'getClerkUser' | 'userRepository'> &
    Partial<Pick<ClerkAuthGatewayDeps, 'getClerkUserById' | 'logger'>>,
): ClerkAuthGateway {
  return new ClerkAuthGateway({
    getClerkUserById: async () => null,
    logger: new FakeLogger(),
    ...deps,
  });
}

describe('ClerkAuthGateway', () => {
  const clerkUpdatedAt = new Date('2026-02-02T00:00:00Z');

  it('returns null from getCurrentUser when unauthenticated', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => null,
    });

    await expect(gateway.getCurrentUser()).resolves.toBeNull();
    expect(await userRepository.findByClerkId('clerk_1')).toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => null,
    });

    await expect(gateway.requireUser()).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('throws INTERNAL_ERROR when the Clerk user has no email addresses', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [],
      }),
    });

    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    expect(await userRepository.findByClerkId('clerk_1')).toBeNull();
  });

  it('uses the primary email address when available', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        updatedAt: clerkUpdatedAt.getTime(),
        primaryEmailAddressId: 'email_2',
        emailAddresses: [
          { id: 'email_1', emailAddress: 'secondary@example.com' },
          { id: 'email_2', emailAddress: 'primary@example.com' },
        ],
      }),
    });

    const user = await gateway.requireUser();
    const storedUser = await userRepository.findByClerkId('clerk_1');

    expect(user.email).toBe('primary@example.com');
    expect(storedUser).not.toBeNull();
    expect(storedUser?.email).toBe('primary@example.com');
    expect(storedUser?.updatedAt).toEqual(clerkUpdatedAt);
  });

  it('uses first email when no primary is set', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        updatedAt: clerkUpdatedAt.getTime(),
        primaryEmailAddressId: null,
        emailAddresses: [
          { id: 'email_1', emailAddress: 'first@example.com' },
          { id: 'email_2', emailAddress: 'second@example.com' },
        ],
      }),
    });

    const user = await gateway.requireUser();
    const storedUser = await userRepository.findByClerkId('clerk_1');

    expect(user.email).toBe('first@example.com');
    expect(storedUser).not.toBeNull();
    expect(storedUser?.email).toBe('first@example.com');
    expect(storedUser?.updatedAt).toEqual(clerkUpdatedAt);
  });

  it('returns the user from the repository', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        updatedAt: clerkUpdatedAt.getTime(),
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      }),
    });

    const user = await gateway.getCurrentUser();
    const storedUser = await userRepository.findByClerkId('clerk_1');

    expect(user).toEqual(storedUser);
    expect(user).toMatchObject({
      email: 'user@example.com',
      createdAt: clerkUpdatedAt,
      updatedAt: clerkUpdatedAt,
    });
  });

  it('accepts Date updatedAt values from Clerk payloads', async () => {
    const userRepository = new FakeUserRepository();
    const observedAt = new Date('2026-02-02T01:23:45.000Z');

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        updatedAt: observedAt,
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      }),
    });

    await expect(gateway.requireUser()).resolves.toMatchObject({
      email: 'user@example.com',
    });
    const storedUser = await userRepository.findByClerkId('clerk_1');
    expect(storedUser).not.toBeNull();
    expect(storedUser?.email).toBe('user@example.com');
    expect(storedUser?.updatedAt).toEqual(observedAt);
  });

  it('throws INTERNAL_ERROR when Clerk updatedAt is missing', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      }),
    });

    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Clerk user updatedAt is required',
    });
    expect(await userRepository.findByClerkId('clerk_1')).toBeNull();
  });

  it('propagates repository errors', async () => {
    const userRepository = new FakeUserRepository();
    userRepository.upsertByClerkId = async () => {
      throw new ApplicationError('CONFLICT', 'User conflict');
    };

    const gateway = createGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        updatedAt: clerkUpdatedAt.getTime(),
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      }),
    });

    await expect(gateway.getCurrentUser()).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('retries transient errors from getClerkUser', async () => {
    const userRepository = new FakeUserRepository();

    const getClerkUser = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
      )
      .mockResolvedValueOnce({
        id: 'clerk_1',
        updatedAt: clerkUpdatedAt.getTime(),
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      });

    const gateway = createGateway({
      userRepository,
      getClerkUser,
    });

    await expect(gateway.getCurrentUser()).resolves.toMatchObject({
      email: 'user@example.com',
    });
    expect(getClerkUser).toHaveBeenCalledTimes(2);
  });

  it('moves a stale owner to its current Clerk email before creating the incoming identity', async () => {
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    const originalOwner = await userRepository.upsertByClerkId(
      'clerk_owner',
      'reused@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const deps = {
      userRepository,
      logger,
      getClerkUser: async () => ({
        id: 'clerk_incoming',
        updatedAt: new Date('2026-02-03T00:00:00Z').getTime(),
        emailAddresses: [{ emailAddress: 'reused@example.com' }],
      }),
      getClerkUserById: async (clerkUserId: string) =>
        clerkUserId === 'clerk_owner'
          ? {
              id: 'clerk_owner',
              updatedAt: new Date('2026-02-02T00:00:00Z').getTime(),
              emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
            }
          : null,
    };
    const gateway = createGateway(deps);

    const incoming = await gateway.requireUser();

    expect(incoming.id).not.toBe(originalOwner.id);
    await expect(
      userRepository.findByClerkId('clerk_owner'),
    ).resolves.toMatchObject({
      id: originalOwner.id,
      email: 'owner-new@example.com',
    });
    await expect(
      userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toMatchObject({
      id: incoming.id,
      email: 'reused@example.com',
    });
    expect(logger.infoCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'existing_identity_email_synchronized',
        },
        msg: 'Resolved Clerk user email ownership conflict',
      },
    ]);
  });

  it('fails closed when the existing Clerk identity no longer exists', async () => {
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    const originalOwner = await userRepository.upsertByClerkId(
      'clerk_owner',
      'reused@example.com',
    );
    const deps = {
      userRepository,
      logger,
      getClerkUser: async () => ({
        id: 'clerk_incoming',
        updatedAt: clerkUpdatedAt.getTime(),
        emailAddresses: [{ emailAddress: 'reused@example.com' }],
      }),
      getClerkUserById: async () => {
        throw Object.assign(new Error('Clerk user not found'), { status: 404 });
      },
    };
    const gateway = createGateway(deps);

    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'CONFLICT',
      existingClerkUserId: 'clerk_owner',
      details: {
        reason: 'user_email_owned_by_another_identity',
      },
    });
    await expect(
      userRepository.findByClerkId('clerk_owner'),
    ).resolves.toMatchObject({ id: originalOwner.id });
    await expect(
      userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toBeNull();
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_existing_identity_missing',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });

  it('does not mutate either row when the incoming identity already owns a row', async () => {
    const userRepository = new FakeUserRepository();
    const logger = new FakeLogger();
    const originalOwner = await userRepository.upsertByClerkId(
      'clerk_owner',
      'held@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const incomingOwner = await userRepository.upsertByClerkId(
      'clerk_incoming',
      'incoming@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const deps = {
      userRepository,
      logger,
      getClerkUser: async () => ({
        id: 'clerk_incoming',
        updatedAt: clerkUpdatedAt.getTime(),
        emailAddresses: [{ emailAddress: 'held@example.com' }],
      }),
      getClerkUserById: async () => ({
        id: 'clerk_owner',
        updatedAt: new Date('2026-02-03T00:00:00Z').getTime(),
        emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
      }),
    };
    const gateway = createGateway(deps);

    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'CONFLICT',
      existingClerkUserId: 'clerk_owner',
      details: {
        reason: 'user_email_owned_by_another_identity',
      },
    });
    await expect(userRepository.findByClerkId('clerk_owner')).resolves.toEqual(
      originalOwner,
    );
    await expect(
      userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toEqual(incomingOwner);
    expect(logger.warnCalls).toEqual([
      {
        context: {
          existingClerkUserId: 'clerk_owner',
          incomingClerkUserId: 'clerk_incoming',
          resolution: 'blocked_incoming_identity_already_exists',
        },
        msg: 'Blocked Clerk user email ownership conflict',
      },
    ]);
  });
});
