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
      trialEndsAt: null,
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
      trialEndsAt: null,
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
      trialEndsAt: new Date('2026-03-01T00:00:00Z'),
    });
  });

  it('surfaces trialEndsAt from currentPeriodEnd only while status is inTrial', async () => {
    const trialEnd = new Date('2026-02-07T00:00:00Z');
    const sub = createSubscription({
      userId: 'user-1',
      status: 'inTrial',
      currentPeriodEnd: trialEnd,
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-02-01T00:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result.trialEndsAt).toEqual(trialEnd);
  });

  it('keeps surfacing trialEndsAt for an inTrial subscription whose period has lapsed', async () => {
    const trialEnd = new Date('2026-02-07T00:00:00Z');
    const sub = createSubscription({
      userId: 'user-1',
      status: 'inTrial',
      currentPeriodEnd: trialEnd,
    });
    const useCase = new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([sub]),
      () => new Date('2026-02-08T00:00:00Z'),
    );

    const result = await useCase.execute({ userId: 'user-1' });
    expect(result).toEqual({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: 'inTrial',
      hasActiveSubscriptionPeriod: false,
      trialEndsAt: trialEnd,
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
      trialEndsAt: null,
    });
  });

  it('returns subscription_canceled for canceled current subscriptions', async () => {
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
      reason: 'subscription_canceled',
      subscriptionStatus: 'canceled',
      hasActiveSubscriptionPeriod: true,
      trialEndsAt: null,
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
      trialEndsAt: null,
    });
  });

  it('returns subscription_required for paymentFailed current subscriptions', async () => {
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
      reason: 'subscription_required',
      subscriptionStatus: 'paymentFailed',
      hasActiveSubscriptionPeriod: true,
      trialEndsAt: null,
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
      trialEndsAt: null,
    });
  });
});
