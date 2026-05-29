import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeUserRepository } from '@/src/application/test-helpers/fakes';
import { ClerkAuthGateway } from './clerk-auth-gateway';

describe('ClerkAuthGateway', () => {
  const clerkUpdatedAt = new Date('2026-02-02T00:00:00Z');

  it('returns null from getCurrentUser when unauthenticated', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser: async () => null,
    });

    await expect(gateway.getCurrentUser()).resolves.toBeNull();
    expect(await userRepository.findByClerkId('clerk_1')).toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const userRepository = new FakeUserRepository();

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
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

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser,
    });

    await expect(gateway.getCurrentUser()).resolves.toMatchObject({
      email: 'user@example.com',
    });
    expect(getClerkUser).toHaveBeenCalledTimes(2);
  });
});
