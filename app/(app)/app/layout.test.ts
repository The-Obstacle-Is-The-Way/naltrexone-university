import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import { enforceEntitledAppUser } from './layout';

type UserLike = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

function createUser(): UserLike {
  return {
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };
}

describe('app/(app)/app/layout', () => {
  it('redirects to /pricing when user is not entitled', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: false })),
    };

    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      enforceEntitledAppUser(
        { authGateway, checkEntitlementUseCase },
        redirectFn as never,
      ),
    ).rejects.toMatchObject({
      message: 'redirect:/pricing?reason=subscription_required',
    });

    expect(checkEntitlementUseCase.execute).toHaveBeenCalledWith({
      userId: 'user_1',
    });
    expect(redirectFn).toHaveBeenCalledWith(
      '/pricing?reason=subscription_required',
    );
  });

  it('does not redirect when user is entitled', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: true })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    await expect(
      enforceEntitledAppUser(
        { authGateway, checkEntitlementUseCase },
        redirectFn as never,
      ),
    ).resolves.toBeUndefined();

    expect(checkEntitlementUseCase.execute).toHaveBeenCalledWith({
      userId: 'user_1',
    });
    expect(redirectFn).not.toHaveBeenCalled();
  });

  it('redirects to /sign-in when unauthenticated', async () => {
    const authGateway: AuthGateway = {
      getCurrentUser: async () => null,
      requireUser: async () => {
        throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
      },
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: false })),
    };

    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      enforceEntitledAppUser(
        { authGateway, checkEntitlementUseCase },
        redirectFn as never,
      ),
    ).rejects.toMatchObject({
      message: 'redirect:/sign-in',
    });

    expect(checkEntitlementUseCase.execute).not.toHaveBeenCalled();
    expect(redirectFn).toHaveBeenCalledWith('/sign-in');
  });
});
