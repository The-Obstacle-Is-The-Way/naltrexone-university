import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import { FakeSubscriptionRepository } from '../test-helpers/fakes';
import { CheckEntitlementUseCase } from './check-entitlement';

describe('CheckEntitlementUseCase', () => {
  it('returns false when no subscription exists', async () => {
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository(),
    );
    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({ isEntitled: false });
  });

  it('returns true when subscription is entitled', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'active',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({ isEntitled: true });
  });
});
