import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { UserRepository } from '@/src/application/ports/repositories';
import { ClerkAuthGateway } from './clerk-auth-gateway';

function createFakeUserRepository(): UserRepository & {
  _calls: { upsertByClerkId: Array<{ clerkId: string; email: string }> };
} {
  const calls: { upsertByClerkId: Array<{ clerkId: string; email: string }> } =
    { upsertByClerkId: [] };
  const baseUser = {
    id: 'user_1',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };

  return {
    _calls: calls,
    findByClerkId: async () => null,
    upsertByClerkId: async (clerkId: string, email: string) => {
      calls.upsertByClerkId.push({ clerkId, email });
      return {
        id: baseUser.id,
        email,
        createdAt: baseUser.createdAt,
        updatedAt: baseUser.updatedAt,
      };
    },
    deleteByClerkId: async () => false,
  };
}

describe('ClerkAuthGateway', () => {
  it('returns null from getCurrentUser when unauthenticated', async () => {
    const userRepository = createFakeUserRepository();

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser: async () => null,
    });

    await expect(gateway.getCurrentUser()).resolves.toBeNull();
    expect(userRepository._calls.upsertByClerkId).toHaveLength(0);
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const userRepository = createFakeUserRepository();

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
    const userRepository = createFakeUserRepository();

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
    expect(userRepository._calls.upsertByClerkId).toHaveLength(0);
  });

  it('uses the primary email address when available', async () => {
    const userRepository = createFakeUserRepository();

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        primaryEmailAddressId: 'email_2',
        emailAddresses: [
          { id: 'email_1', emailAddress: 'secondary@example.com' },
          { id: 'email_2', emailAddress: 'primary@example.com' },
        ],
      }),
    });

    const user = await gateway.requireUser();

    expect(user.email).toBe('primary@example.com');
    expect(userRepository._calls.upsertByClerkId).toEqual([
      { clerkId: 'clerk_1', email: 'primary@example.com' },
    ]);
  });

  it('uses first email when no primary is set', async () => {
    const userRepository = createFakeUserRepository();

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        primaryEmailAddressId: null,
        emailAddresses: [
          { id: 'email_1', emailAddress: 'first@example.com' },
          { id: 'email_2', emailAddress: 'second@example.com' },
        ],
      }),
    });

    const user = await gateway.requireUser();

    expect(user.email).toBe('first@example.com');
    expect(userRepository._calls.upsertByClerkId).toEqual([
      { clerkId: 'clerk_1', email: 'first@example.com' },
    ]);
  });

  it('returns the user from the repository', async () => {
    const userRepository = createFakeUserRepository();

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      }),
    });

    const user = await gateway.getCurrentUser();

    expect(user).toEqual({
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });
  });

  it('propagates repository errors', async () => {
    const userRepository = createFakeUserRepository();
    userRepository.upsertByClerkId = async () => {
      throw new ApplicationError('CONFLICT', 'User conflict');
    };

    const gateway = new ClerkAuthGateway({
      userRepository,
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      }),
    });

    await expect(gateway.getCurrentUser()).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
