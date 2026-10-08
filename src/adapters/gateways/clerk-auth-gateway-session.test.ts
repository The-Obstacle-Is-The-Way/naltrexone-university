import { describe, expect, it, vi } from 'vitest';
import {
  FakeDeletedClerkUserRepository,
  FakeLogger,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import {
  ClerkAuthGateway,
  type ClerkUserLike,
  type ClerkUserLookup,
} from './clerk-auth-gateway';
import { clerkAnswer, clerkSdkErrorFor } from './test-helpers/clerk-sdk-errors';

vi.mock('server-only', () => ({}));

// DEBT-503 item 1: the Clerk user ID comes from the session the middleware
// verified. A signed-in request reads our own row and the deletion tombstone,
// and spends Clerk's Backend API allowance only to provision a missing row or
// to refresh the email billing sends to Stripe.

const clerkUpdatedAt = new Date('2026-02-02T00:00:00Z');

function clerkUser(id: string, email: string, updatedAt = clerkUpdatedAt) {
  return {
    id,
    updatedAt: updatedAt.getTime(),
    emailAddresses: [{ emailAddress: email }],
  } satisfies ClerkUserLike;
}

function countingLookup(
  answer: (clerkUserId: string) => Promise<ClerkUserLike | null>,
) {
  const calls: string[] = [];
  const lookup: ClerkUserLookup = async (clerkUserId) => {
    calls.push(clerkUserId);
    return answer(clerkUserId);
  };
  return { lookup, calls };
}

function setup(input: {
  sessionClerkUserId: string | null;
  answer?: (clerkUserId: string) => Promise<ClerkUserLike | null>;
}) {
  const userRepository = new FakeUserRepository();
  const deletedClerkUsers = new FakeDeletedClerkUserRepository();
  const logger = new FakeLogger();
  const { lookup, calls } = countingLookup(input.answer ?? (async () => null));
  const gateway = new ClerkAuthGateway({
    userRepository,
    deletedClerkUsers,
    getSessionClerkUserId: async () => input.sessionClerkUserId,
    getClerkUserById: lookup,
    logger,
  });
  return { gateway, userRepository, deletedClerkUsers, logger, calls };
}

describe('ClerkAuthGateway session identity', () => {
  it('returns no user without a session, and asks Clerk nothing', async () => {
    const { gateway, calls } = setup({ sessionClerkUserId: null });

    await expect(gateway.getCurrentUser()).resolves.toBeNull();
    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(calls).toEqual([]);
  });

  it('serves an existing row with no Clerk call and no write', async () => {
    const { gateway, userRepository, calls } = setup({
      sessionClerkUserId: 'clerk_1',
      answer: async () => clerkUser('clerk_1', 'changed@example.com'),
    });
    const row = await userRepository.upsertByClerkId(
      'clerk_1',
      'stored@example.com',
      { observedAt: new Date('2026-01-01T00:00:00Z') },
    );

    await expect(gateway.getCurrentUser()).resolves.toEqual(row);
    await expect(gateway.requireUser()).resolves.toEqual(row);
    expect(calls).toEqual([]);
    await expect(userRepository.findByClerkId('clerk_1')).resolves.toEqual(row);
  });

  it.each([
    ['no leftover row', false],
    ['a leftover row', true],
  ])(
    'returns no user for a tombstoned session, with %s, and asks Clerk nothing',
    async (_case, leftoverRow) => {
      const { gateway, userRepository, deletedClerkUsers, logger, calls } =
        setup({
          sessionClerkUserId: 'clerk_gone',
          answer: async () => clerkUser('clerk_gone', 'gone@example.com'),
        });
      if (leftoverRow) {
        await userRepository.upsertByClerkId('clerk_gone', 'gone@example.com');
      }
      await deletedClerkUsers.markDeleted('clerk_gone');

      await expect(gateway.getCurrentUser()).resolves.toBeNull();
      expect(calls).toEqual([]);
      expect(logger.warnCalls).toEqual([
        {
          context: { clerkUserId: 'clerk_gone' },
          msg: 'clerk_session_for_deleted_user',
        },
      ]);
    },
  );

  it('provisions a missing row with exactly one Clerk lookup', async () => {
    const { gateway, userRepository, calls } = setup({
      sessionClerkUserId: 'clerk_new',
      answer: async (id) => clerkUser(id, 'new@example.com'),
    });

    await expect(gateway.getCurrentUser()).resolves.toMatchObject({
      email: 'new@example.com',
    });
    expect(calls).toEqual(['clerk_new']);
    await expect(
      userRepository.findByClerkId('clerk_new'),
    ).resolves.toMatchObject({ email: 'new@example.com' });
  });

  it('returns no user, and creates no row, when Clerk answers 404 for the session user', async () => {
    const notFound = await clerkSdkErrorFor(clerkAnswer(404));
    const { gateway, userRepository, logger } = setup({
      sessionClerkUserId: 'clerk_missing',
      answer: async () => {
        throw notFound;
      },
    });

    await expect(gateway.getCurrentUser()).resolves.toBeNull();
    await expect(
      userRepository.findByClerkId('clerk_missing'),
    ).resolves.toBeNull();
    expect(logger.warnCalls).toEqual([
      {
        context: { clerkUserId: 'clerk_missing' },
        msg: 'clerk_session_user_not_found',
      },
    ]);
  });

  it('refuses a Clerk answer for a different user', async () => {
    const { gateway, userRepository } = setup({
      sessionClerkUserId: 'clerk_asked',
      answer: async () => clerkUser('clerk_other', 'other@example.com'),
    });

    await expect(gateway.getCurrentUser()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    await expect(
      userRepository.findByClerkId('clerk_other'),
    ).resolves.toBeNull();
  });

  it('retries a rate-limited provisioning lookup, then fails without creating a row', async () => {
    const { gateway, userRepository, calls } = setup({
      sessionClerkUserId: 'clerk_new',
      answer: async () => {
        throw Object.assign(new Error('Too Many Requests'), { status: 429 });
      },
    });

    await expect(gateway.getCurrentUser()).rejects.toMatchObject({
      status: 429,
    });
    expect(calls).toEqual(['clerk_new', 'clerk_new', 'clerk_new']);
    await expect(userRepository.findByClerkId('clerk_new')).resolves.toBeNull();
  });

  describe('requireUser({ currentEmail: true })', () => {
    it("refreshes an existing row's email from Clerk with one lookup", async () => {
      const { gateway, userRepository, calls } = setup({
        sessionClerkUserId: 'clerk_1',
        answer: async (id) =>
          clerkUser(
            id,
            'changed@example.com',
            new Date('2026-03-01T00:00:00Z'),
          ),
      });
      const row = await userRepository.upsertByClerkId(
        'clerk_1',
        'stored@example.com',
        { observedAt: new Date('2026-02-01T00:00:00Z') },
      );

      await expect(
        gateway.requireUser({ currentEmail: true }),
      ).resolves.toMatchObject({ id: row.id, email: 'changed@example.com' });
      expect(calls).toEqual(['clerk_1']);
    });

    it('refuses a tombstoned session before asking Clerk', async () => {
      const { gateway, deletedClerkUsers, calls } = setup({
        sessionClerkUserId: 'clerk_gone',
        answer: async (id) => clerkUser(id, 'gone@example.com'),
      });
      await deletedClerkUsers.markDeleted('clerk_gone');

      await expect(
        gateway.requireUser({ currentEmail: true }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(calls).toEqual([]);
    });

    it('refuses when Clerk answers 404 for the session user', async () => {
      const notFound = await clerkSdkErrorFor(clerkAnswer(404));
      const { gateway, userRepository } = setup({
        sessionClerkUserId: 'clerk_1',
        answer: async () => {
          throw notFound;
        },
      });
      await userRepository.upsertByClerkId('clerk_1', 'stored@example.com');

      await expect(
        gateway.requireUser({ currentEmail: true }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    // BUG-284: the refresh keeps provisioning's ownership rules. The session
    // user's row is still served on ordinary pages.
    it('keeps both rows when the refreshed email is held by another identity', async () => {
      const { gateway, userRepository, logger } = setup({
        sessionClerkUserId: 'clerk_incoming',
        answer: async (id) =>
          id === 'clerk_incoming'
            ? clerkUser(id, 'held@example.com')
            : clerkUser(
                id,
                'owner-new@example.com',
                new Date('2026-02-03T00:00:00Z'),
              ),
      });
      const owner = await userRepository.upsertByClerkId(
        'clerk_owner',
        'held@example.com',
        { observedAt: new Date('2026-02-01T00:00:00Z') },
      );
      const incoming = await userRepository.upsertByClerkId(
        'clerk_incoming',
        'incoming@example.com',
        { observedAt: new Date('2026-02-01T00:00:00Z') },
      );

      await expect(
        gateway.requireUser({ currentEmail: true }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { reason: 'user_email_owned_by_another_identity' },
      });
      await expect(
        userRepository.findByClerkId('clerk_owner'),
      ).resolves.toEqual(owner);
      await expect(gateway.getCurrentUser()).resolves.toEqual(incoming);
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
});
