import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('./env', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: 'whsec_1',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
  },
}));

vi.mock('./stripe', () => ({
  stripe: {},
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
});

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
      insertReturning,
      insertValues,
    },
  } as const;
}

// TODO: DEBT-035 - These tests use vi.mock() for our own code which violates
// "fakes over mocks" convention. They pass in isolation but fail when run with
// other tests due to module caching. Fix requires DEBT-032 (injectable composition root).
describe.skip('lib/auth', () => {
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

  it('getAuth forwards the Clerk session response', async () => {
    authMock.mockReturnValue({ userId: 'clerk_1' });

    const { getAuth } = await import('./auth');

    expect(await getAuth()).toEqual({ userId: 'clerk_1' });
  });

  it('getCurrentUser returns a domain User and ensures a DB user row exists', async () => {
    const db = createDbMock();
    const inserted = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    currentUserMock.mockResolvedValue({
      id: 'clerk_1',
      emailAddresses: [{ emailAddress: 'a@example.com' }],
    });
    db._mocks.queryFindFirst.mockResolvedValue(null);
    db._mocks.insertReturning.mockResolvedValue([inserted]);
    dbMock = db as unknown;

    const { getCurrentUser } = await import('./auth');

    await expect(getCurrentUser()).resolves.toEqual({
      id: 'db_user_1',
      email: 'a@example.com',
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    });
  });

  it('getCurrentUser prefers the primary email address when available', async () => {
    const db = createDbMock();
    const inserted = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'primary@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    currentUserMock.mockResolvedValue({
      id: 'clerk_1',
      primaryEmailAddressId: 'email_2',
      emailAddresses: [
        { id: 'email_1', emailAddress: 'secondary@example.com' },
        { id: 'email_2', emailAddress: 'primary@example.com' },
      ],
    });
    db._mocks.queryFindFirst.mockResolvedValue(null);
    db._mocks.insertReturning.mockResolvedValue([inserted]);
    dbMock = db as unknown;

    const { getCurrentUser } = await import('./auth');

    await expect(getCurrentUser()).resolves.toMatchObject({
      email: 'primary@example.com',
    });

    expect(db._mocks.insertValues).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
      email: 'primary@example.com',
    });
  });
});
