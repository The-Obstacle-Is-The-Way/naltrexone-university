import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const dbMock = {
  query: {
    stripeSubscriptions: {
      findFirst: vi.fn(),
    },
  },
} as const;

vi.mock('./db', () => ({
  db: dbMock,
}));

describe('lib/subscription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    dbMock.query.stripeSubscriptions.findFirst.mockReset();
  });

  it('returns false from isUserEntitled when no entitled subscription exists', async () => {
    dbMock.query.stripeSubscriptions.findFirst.mockResolvedValue(null);

    const { isUserEntitled } = await import('./subscription');

    await expect(isUserEntitled('user_1')).resolves.toBe(false);
  });

  it('returns true from isUserEntitled when an entitled subscription exists', async () => {
    dbMock.query.stripeSubscriptions.findFirst.mockResolvedValue({
      id: 'sub_1',
    });

    const { isUserEntitled } = await import('./subscription');

    await expect(isUserEntitled('user_1')).resolves.toBe(true);
  });

  it('returns the raw subscription row from getUserSubscription', async () => {
    const row = { id: 'sub_1' };
    dbMock.query.stripeSubscriptions.findFirst.mockResolvedValue(row);

    const { getUserSubscription } = await import('./subscription');

    await expect(getUserSubscription('user_1')).resolves.toEqual(row);
  });

  it('throws ApplicationError(UNSUBSCRIBED) when user is not entitled', async () => {
    dbMock.query.stripeSubscriptions.findFirst.mockResolvedValue(null);

    const { requireSubscriptionOrThrow } = await import('./subscription');

    await expect(requireSubscriptionOrThrow('user_1')).rejects.toMatchObject({
      code: 'UNSUBSCRIBED',
    });
  });

  it('does not throw when user is entitled', async () => {
    dbMock.query.stripeSubscriptions.findFirst.mockResolvedValue({
      id: 'sub_1',
    });

    const { requireSubscriptionOrThrow } = await import('./subscription');

    await expect(requireSubscriptionOrThrow('user_1')).resolves.toBeUndefined();
  });
});
