import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';

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
  it('throws ApplicationError(UNSUBSCRIBED) when user is not entitled', async () => {
    dbMock.query.stripeSubscriptions.findFirst.mockResolvedValue(null);

    const { requireSubscriptionOrThrow } = await import('./subscription');

    await expect(requireSubscriptionOrThrow('user_1')).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(requireSubscriptionOrThrow('user_1')).rejects.toMatchObject({
      code: 'UNSUBSCRIBED',
    });
  });
});
