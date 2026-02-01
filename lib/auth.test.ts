import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';

vi.mock('server-only', () => ({}));
vi.mock('./db', () => ({ db: {} }));

const currentUserMock = vi.fn();
const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: () => currentUserMock(),
  auth: () => authMock(),
}));

describe('lib/auth', () => {
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
});
