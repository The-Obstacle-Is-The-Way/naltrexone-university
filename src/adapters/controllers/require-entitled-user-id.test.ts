import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import { requireEntitledUserId } from './require-entitled-user-id';

describe('requireEntitledUserId', () => {
  it('returns the user id when the user is entitled', async () => {
    const user = createUser({ id: 'user_1' });

    const authGateway = new FakeAuthGateway(user);
    const subscriptionRepository = new FakeSubscriptionRepository([
      createSubscription({
        userId: user.id,
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
      }),
    ]);
    const checkEntitlementUseCase = new CheckEntitlementUseCase(
      subscriptionRepository,
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      requireEntitledUserId({ authGateway, checkEntitlementUseCase }),
    ).resolves.toBe(user.id);
  });

  it('throws UNSUBSCRIBED when the user is not entitled', async () => {
    const user = createUser({ id: 'user_1' });

    const authGateway = new FakeAuthGateway(user);
    const subscriptionRepository = new FakeSubscriptionRepository([]);
    const checkEntitlementUseCase = new CheckEntitlementUseCase(
      subscriptionRepository,
      () => new Date('2026-02-01T00:00:00Z'),
    );

    const promise = requireEntitledUserId({
      authGateway,
      checkEntitlementUseCase,
    });
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({ code: 'UNSUBSCRIBED' });
  });
});
