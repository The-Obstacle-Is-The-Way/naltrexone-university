import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { seedTrialSetupOperation } from '@/src/application/test-helpers/trial-payment-method-setup-operations';
import { CheckTrialSavedCardUseCase } from '@/src/application/use-cases';
import {
  createUser as createDomainUser,
  createSubscription,
} from '@/src/domain/test-helpers';
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

// BUG-308: the real use case over the maintained fakes, with or without a
// card that the add-card flow set as the trial subscription's default.
async function createCheckTrialSavedCardUseCase(cardSaved = false) {
  const operations = new FakeTrialPaymentMethodSetupOperationRepository();
  if (cardSaved) {
    await seedTrialSetupOperation(operations, {
      userId: fixtureUser1Id,
      stripeSubscriptionId: 'sub_trial',
      stage: 'completed',
    });
  }
  return new CheckTrialSavedCardUseCase(
    new FakeSubscriptionRepository([
      {
        subscription: createSubscription({
          userId: fixtureUser1Id,
          status: 'inTrial',
        }),
        externalSubscriptionId: 'sub_trial',
      },
    ]),
    operations,
  );
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
        checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
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
        {
          authGateway,
          checkEntitlementUseCase,
          checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
        },
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
        plan: 'monthly' as const,
      })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    const result = await enforceEntitledAppUser(
      {
        authGateway,
        checkEntitlementUseCase,
        checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
      },
      redirectFn as never,
    );

    expect(result).toEqual({
      subscriptionStatus: 'active',
      plan: 'monthly',
      trialEndsAt: null,
      trialCardSaved: false,
    });
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
        plan: 'annual' as const,
        trialEndsAt,
      })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    const result = await enforceEntitledAppUser(
      {
        authGateway,
        checkEntitlementUseCase,
        checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
      },
      redirectFn as never,
    );

    expect(result).toEqual({
      subscriptionStatus: 'inTrial',
      plan: 'annual',
      trialEndsAt,
      trialCardSaved: false,
    });
    expect(redirectFn).not.toHaveBeenCalled();
  });

  // BUG-308: the banner must not ask for a card the learner already saved.
  it.each([
    ['inTrial', true, true],
    ['inTrial', false, false],
    ['active', true, false],
  ] as const)(
    'reports trialCardSaved for a %s learner with a saved card=%s as %s',
    async (subscriptionStatus, cardSaved, expected) => {
      const authGateway = new FakeAuthGateway(
        createDomainUser({ id: fixtureUser1Id }),
      );
      const checkEntitlementUseCase = {
        execute: async () => ({
          isEntitled: true,
          reason: null,
          subscriptionStatus,
          plan: 'monthly' as const,
          trialEndsAt:
            subscriptionStatus === 'inTrial'
              ? new Date('2026-02-08T00:00:00Z')
              : null,
        }),
      };

      const result = await enforceEntitledAppUser({
        authGateway,
        checkEntitlementUseCase,
        checkTrialSavedCardUseCase:
          await createCheckTrialSavedCardUseCase(cardSaved),
      });

      expect(result.trialCardSaved).toBe(expected);
    },
  );

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
        plan: 'monthly' as const,
      })),
    };

    const redirectFn = vi.fn(() => {
      throw new Error('unexpected redirect');
    });

    const result = await enforceEntitledAppUser(
      {
        authGateway,
        checkEntitlementUseCase,
        checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
      },
      redirectFn as never,
    );

    expect(result).toEqual({
      subscriptionStatus: 'pastDue',
      plan: 'monthly',
      trialEndsAt: null,
      trialCardSaved: false,
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

  it('getTrialDaysLeft never drops below 1 when render time passes the boundary', () => {
    expect(
      getTrialDaysLeft(
        new Date('2026-02-08T00:00:00Z'),
        new Date('2026-02-08T00:00:00Z'),
      ),
    ).toBe(1);
    expect(
      getTrialDaysLeft(
        new Date('2026-02-08T00:00:00Z'),
        new Date('2026-02-08T00:00:05Z'),
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
        {
          authGateway,
          checkEntitlementUseCase,
          checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
        },
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
        {
          authGateway,
          checkEntitlementUseCase,
          checkTrialSavedCardUseCase: await createCheckTrialSavedCardUseCase(),
        },
        redirectFn as never,
      ),
    ).rejects.toMatchObject({
      message: 'redirect:/pricing?reason=manage_billing',
    });

    expect(redirectFn).toHaveBeenCalledWith('/pricing?reason=manage_billing');
  });
});
