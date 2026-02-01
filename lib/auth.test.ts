import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';

vi.mock('server-only', () => ({}));

const currentUserMock = vi.fn();
const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: () => currentUserMock(),
  auth: () => authMock(),
}));

let dbMock: unknown;
vi.mock('./db', () => ({
  get db() {
    return dbMock;
  },
}));

afterEach(() => {
  currentUserMock.mockReset();
  authMock.mockReset();
  vi.restoreAllMocks();
});

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

describe('lib/auth', () => {
  it('returns the Clerk user when authenticated', async () => {
    currentUserMock.mockResolvedValue({ id: 'user_1' });

    const { getClerkUserOrThrow } = await import('./auth');

    await expect(getClerkUserOrThrow()).resolves.toMatchObject({
      id: 'user_1',
    });
  });

  it('throws ApplicationError(UNAUTHENTICATED) when no Clerk user exists', async () => {
    currentUserMock.mockResolvedValue(null);

    const { getClerkUserOrThrow } = await import('./auth');

    await expect(getClerkUserOrThrow()).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(getClerkUserOrThrow()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('throws ApplicationError when Clerk user has no email', async () => {
    currentUserMock.mockResolvedValue({
      id: 'user_1',
      emailAddresses: [],
    });

    const { getCurrentUser } = await import('./auth');

    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApplicationError);
  });

  it('returns existing user row when email matches', async () => {
    const db = createDbMock();
    const existing = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
    };

    db._mocks.queryFindFirst.mockResolvedValue(existing);
    dbMock = db as unknown;

    const { ensureUserRow } = await import('./auth');

    await expect(ensureUserRow('clerk_1', 'a@example.com')).resolves.toEqual(
      existing,
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates the email when the user row exists but email changed', async () => {
    const db = createDbMock();
    const existing = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'old@example.com',
    };
    const updated = { ...existing, email: 'new@example.com' };

    db._mocks.queryFindFirst.mockResolvedValue(existing);
    db._mocks.updateReturning.mockResolvedValue([updated]);
    dbMock = db as unknown;

    const { ensureUserRow } = await import('./auth');

    await expect(ensureUserRow('clerk_1', 'new@example.com')).resolves.toEqual(
      updated,
    );
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('inserts and returns a new user row when none exists', async () => {
    const db = createDbMock();
    const inserted = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
    };

    db._mocks.queryFindFirst.mockResolvedValue(null);
    db._mocks.insertReturning.mockResolvedValue([inserted]);
    dbMock = db as unknown;

    const { ensureUserRow } = await import('./auth');

    await expect(ensureUserRow('clerk_1', 'a@example.com')).resolves.toEqual(
      inserted,
    );
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._mocks.queryFindFirst).toHaveBeenCalledTimes(1);
  });

  it('handles a concurrent insert by re-fetching the row and returning it (idempotent)', async () => {
    const db = createDbMock();
    const after = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
    };

    db._mocks.queryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(after);
    db._mocks.insertReturning.mockResolvedValue([]);
    dbMock = db as unknown;

    const { ensureUserRow } = await import('./auth');

    await expect(ensureUserRow('clerk_1', 'a@example.com')).resolves.toEqual(
      after,
    );
    expect(db._mocks.queryFindFirst).toHaveBeenCalledTimes(2);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('handles a concurrent insert by updating the email after refetch', async () => {
    const db = createDbMock();
    const after = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'old@example.com',
    };
    const updated = { ...after, email: 'new@example.com' };

    db._mocks.queryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(after);
    db._mocks.insertReturning.mockResolvedValue([]);
    db._mocks.updateReturning.mockResolvedValue([updated]);
    dbMock = db as unknown;

    const { ensureUserRow } = await import('./auth');

    await expect(ensureUserRow('clerk_1', 'new@example.com')).resolves.toEqual(
      updated,
    );
    expect(db._mocks.queryFindFirst).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('throws INTERNAL_ERROR when a concurrent insert occurs but the row cannot be fetched', async () => {
    const db = createDbMock();

    db._mocks.queryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    db._mocks.insertReturning.mockResolvedValue([]);
    dbMock = db as unknown;

    const { ensureUserRow } = await import('./auth');

    await expect(
      ensureUserRow('clerk_1', 'a@example.com'),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('getAuth forwards the Clerk session response', async () => {
    authMock.mockReturnValue({ userId: 'clerk_1' });

    const { getAuth } = await import('./auth');

    expect(await getAuth()).toEqual({ userId: 'clerk_1' });
  });

  it('getCurrentUser returns the ensured db user row when an email exists', async () => {
    const db = createDbMock();
    const inserted = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
    };

    currentUserMock.mockResolvedValue({
      id: 'clerk_1',
      emailAddresses: [{ emailAddress: 'a@example.com' }],
    });
    db._mocks.queryFindFirst.mockResolvedValue(null);
    db._mocks.insertReturning.mockResolvedValue([inserted]);
    dbMock = db as unknown;

    const { getCurrentUser } = await import('./auth');

    await expect(getCurrentUser()).resolves.toEqual(inserted);
  });
});
