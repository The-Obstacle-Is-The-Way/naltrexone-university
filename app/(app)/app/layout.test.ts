import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';
import { enforceEntitledAppUser, getTrialDaysLeft } from './layout';

const { fixtureUser1Id } = vi.hoisted(() => ({
  fixtureUser1Id: crypto.randomUUID(),
}));

type UserLike = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

function createUser(): UserLike {
  return {
    id: fixtureUser1Id,
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };
}

describe('app/(app)/app/layout', () => {
  it('uses maxDuration without exporting incompatible dynamic route config', async () => {
    const mod = await import('./layout');
    expect((mod as Record<string, unknown>).dynamic).toBeUndefined();
    expect((mod as Record<string, unknown>).maxDuration).toBe(30);
  });

  it('throws UNAUTHENTICATED when no user is signed in', async () => {
    const authGateway = new FakeAuthGateway(null);
    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: false,
        reason: 'subscription_required' as const,
      })),
    };

    await expect(
      enforceEntitledAppUser({
        authGateway,
        checkEntitlementUseCase,
      }),
    ).rejects.toEqual(
      new ApplicationError('UNAUTHENTICATED', 'User not authenticated'),
    );

    expect(checkEntitlementUseCase.execute).not.toHaveBeenCalled();
  });

  it('scenario 6: redirects non-entitled users away from app routes', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: false,
        reason: 'subscription_required' as const,
      })),
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
      userId: fixtureUser1Id,
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
      execute: vi.fn(async () => ({
        isEntitled: true,
        reason: null,
        subscriptionStatus: 'active' as const,
      })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    const result = await enforceEntitledAppUser(
      { authGateway, checkEntitlementUseCase },
      redirectFn as never,
    );

    expect(result).toEqual({ subscriptionStatus: 'active', trialEndsAt: null });
    expect(checkEntitlementUseCase.execute).toHaveBeenCalledWith({
      userId: fixtureUser1Id,
    });
    expect(redirectFn).not.toHaveBeenCalled();
  });

  it('returns trialEndsAt for entitled inTrial users', async () => {
    const user = createUser();
    const trialEndsAt = new Date('2026-02-08T00:00:00Z');

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: true,
        reason: null,
        subscriptionStatus: 'inTrial' as const,
        trialEndsAt,
      })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    const result = await enforceEntitledAppUser(
      { authGateway, checkEntitlementUseCase },
      redirectFn as never,
    );

    expect(result).toEqual({ subscriptionStatus: 'inTrial', trialEndsAt });
    expect(redirectFn).not.toHaveBeenCalled();
  });

  it('returns subscriptionStatus pastDue when pastDue user is entitled', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: true,
        reason: null,
        subscriptionStatus: 'pastDue' as const,
      })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    const result = await enforceEntitledAppUser(
      { authGateway, checkEntitlementUseCase },
      redirectFn as never,
    );

    expect(result).toEqual({
      subscriptionStatus: 'pastDue',
      trialEndsAt: null,
    });
    expect(redirectFn).not.toHaveBeenCalled();
  });

  it('getTrialDaysLeft rounds partial days up', () => {
    expect(
      getTrialDaysLeft(
        new Date('2026-02-08T00:00:00Z'),
        new Date('2026-02-04T12:00:00Z'),
      ),
    ).toBe(4);
  });

  it('getTrialDaysLeft returns 7 at the start of a 7-day trial', () => {
    expect(
      getTrialDaysLeft(
        new Date('2026-02-08T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
      ),
    ).toBe(7);
  });

  it('getTrialDaysLeft returns 1 within the final partial day', () => {
    expect(
      getTrialDaysLeft(
        new Date('2026-02-08T00:00:00Z'),
        new Date('2026-02-07T21:00:00Z'),
      ),
    ).toBe(1);
  });

  it('redirects paymentProcessing users to payment_processing reason', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: false,
        reason: 'payment_processing' as const,
      })),
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
      message: 'redirect:/pricing?reason=payment_processing',
    });

    expect(redirectFn).toHaveBeenCalledWith(
      '/pricing?reason=payment_processing',
    );
  });

  it('redirects non-entitled billing states to manage_billing reason', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: false,
        reason: 'manage_billing' as const,
      })),
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
      message: 'redirect:/pricing?reason=manage_billing',
    });

    expect(redirectFn).toHaveBeenCalledWith('/pricing?reason=manage_billing');
  });
});
