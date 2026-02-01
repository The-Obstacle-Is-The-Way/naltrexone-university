import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { ClerkAuthGateway } from './clerk-auth-gateway';

function createDbMock() {
  const queryFindFirst = vi.fn();

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const insertReturning = vi.fn();
  const insertOnConflictDoNothing = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: insertOnConflictDoNothing,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    query: {
      users: {
        findFirst: queryFindFirst,
      },
    },
    update,
    insert,
    _mocks: {
      queryFindFirst,
      updateReturning,
      updateWhere,
      updateSet,
      insertReturning,
      insertOnConflictDoNothing,
      insertValues,
    },
  } as const;
}

describe('ClerkAuthGateway', () => {
  it('returns null from getCurrentUser when unauthenticated', async () => {
    const db = {
      query: {
        users: {
          findFirst: vi.fn(() => {
            throw new Error('unexpected db query');
          }),
        },
      },
      update: () => {
        throw new Error('unexpected db update');
      },
      insert: () => {
        throw new Error('unexpected db insert');
      },
    } as const;

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => null,
    });

    await expect(gateway.getCurrentUser()).resolves.toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const db = {
      query: {
        users: {
          findFirst: vi.fn(() => {
            throw new Error('unexpected db query');
          }),
        },
      },
      update: () => {
        throw new Error('unexpected db update');
      },
      insert: () => {
        throw new Error('unexpected db insert');
      },
    } as const;

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
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
    const db = {
      query: {
        users: {
          findFirst: vi.fn(() => {
            throw new Error('unexpected db query');
          }),
        },
      },
      update: () => {
        throw new Error('unexpected db update');
      },
      insert: () => {
        throw new Error('unexpected db insert');
      },
    } as const;

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [],
      }),
    });

    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('uses the primary email address when available', async () => {
    const db = createDbMock();

    const inserted = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'primary@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    db._mocks.queryFindFirst.mockResolvedValue(null);
    db._mocks.insertReturning.mockResolvedValue([inserted]);

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => ({
        id: 'clerk_1',
        primaryEmailAddressId: 'email_2',
        emailAddresses: [
          { id: 'email_1', emailAddress: 'secondary@example.com' },
          { id: 'email_2', emailAddress: 'primary@example.com' },
        ],
      }),
    });

    await expect(gateway.requireUser()).resolves.toEqual({
      id: 'db_user_1',
      email: 'primary@example.com',
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    });

    expect(db._mocks.insertValues).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
      email: 'primary@example.com',
    });
  });

  it('returns existing user when email matches', async () => {
    const db = createDbMock();
    const existing = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    db._mocks.queryFindFirst.mockResolvedValue(existing);

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'a@example.com' }],
      }),
    });

    await expect(gateway.getCurrentUser()).resolves.toEqual({
      id: existing.id,
      email: existing.email,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    });

    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates the email when the user exists but the Clerk email changed', async () => {
    const db = createDbMock();
    const existing = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'old@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };
    const updated = {
      ...existing,
      email: 'new@example.com',
      updatedAt: new Date('2026-02-01T01:00:00Z'),
    };

    db._mocks.queryFindFirst.mockResolvedValue(existing);
    db._mocks.updateReturning.mockResolvedValue([updated]);

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'new@example.com' }],
      }),
      now: () => new Date('2026-02-01T01:00:00Z'),
    });

    await expect(gateway.requireUser()).resolves.toEqual({
      id: updated.id,
      email: updated.email,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('handles a concurrent insert by re-fetching the row (idempotent)', async () => {
    const db = createDbMock();
    const after = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    db._mocks.queryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(after);
    db._mocks.insertReturning.mockResolvedValue([]);

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'a@example.com' }],
      }),
    });

    await expect(gateway.requireUser()).resolves.toEqual({
      id: after.id,
      email: after.email,
      createdAt: after.createdAt,
      updatedAt: after.updatedAt,
    });
    expect(db._mocks.queryFindFirst).toHaveBeenCalledTimes(2);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('maps Postgres unique violations to CONFLICT', async () => {
    const db = createDbMock();
    const existing = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'old@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    db._mocks.queryFindFirst.mockResolvedValue(existing);
    db._mocks.updateReturning.mockRejectedValue({ code: '23505' });

    const gateway = new ClerkAuthGateway({
      db: db as unknown as ConstructorParameters<
        typeof ClerkAuthGateway
      >[0]['db'],
      getClerkUser: async () => ({
        id: 'clerk_1',
        emailAddresses: [{ emailAddress: 'new@example.com' }],
      }),
      now: () => new Date('2026-02-01T01:00:00Z'),
    });

    await expect(gateway.requireUser()).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(gateway.requireUser()).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
