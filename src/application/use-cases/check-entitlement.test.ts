import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import { FakeSubscriptionRepository } from '../test-helpers/fakes';
import { CheckEntitlementUseCase } from './check-entitlement';

describe('CheckEntitlementUseCase', () => {
  it('returns subscription_required when no subscription exists', async () => {
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository(),
    );
    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: null,
      hasActiveSubscriptionPeriod: false,
    });
  });

  it('returns true and reason null when subscription is entitled', async () => {
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
    expect(result).toEqual({
      isEntitled: true,
      reason: null,
      subscriptionStatus: 'active',
      hasActiveSubscriptionPeriod: true,
    });
  });

  it('returns true and reason null when subscription is inTrial', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'inTrial',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: true,
      reason: null,
      subscriptionStatus: 'inTrial',
      hasActiveSubscriptionPeriod: true,
    });
  });

  it('returns true and reason null when subscription is pastDue with active period', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'pastDue',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: true,
      reason: null,
      subscriptionStatus: 'pastDue',
      hasActiveSubscriptionPeriod: true,
    });
  });

  it('returns manage_billing for non-entitled current subscriptions', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'canceled',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: false,
      reason: 'manage_billing',
      subscriptionStatus: 'canceled',
      hasActiveSubscriptionPeriod: true,
    });
  });

  it('returns payment_processing for paymentProcessing current subscriptions', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'paymentProcessing',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: false,
      reason: 'payment_processing',
      subscriptionStatus: 'paymentProcessing',
      hasActiveSubscriptionPeriod: true,
    });
  });

  it('returns payment_processing for paymentFailed current subscriptions', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'paymentFailed',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: false,
      reason: 'payment_processing',
      subscriptionStatus: 'paymentFailed',
      hasActiveSubscriptionPeriod: true,
    });
  });

  it('returns subscription_required when current period has ended', async () => {
    const sub = createSubscription({
      userId: 'user-1',
      status: 'active',
      currentPeriodEnd: new Date('2026-01-31T12:00:00Z'),
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-01-31T12:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: 'active',
      hasActiveSubscriptionPeriod: false,
    });
  });
});
