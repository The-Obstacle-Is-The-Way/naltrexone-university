import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakeAuthGateway,
  FakePaymentGateway,
  FakePracticeSessionRepository,
  FakeSubscriptionRepository,
} from './fakes';

describe('FakePracticeSessionRepository', () => {
  it('throws NOT_FOUND when ending a missing session', async () => {
    const repo = new FakePracticeSessionRepository();

    await expect(repo.end('missing', 'user-1')).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('throws CONFLICT when ending an already-ended session', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      endedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const repo = new FakePracticeSessionRepository([session]);

    await expect(repo.end('session-1', 'user-1')).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Practice session already ended'),
    );
  });
});

describe('FakeSubscriptionRepository', () => {
  it('upserts subscriptions and supports lookup by stripeSubscriptionId', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(repo.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });

    await repo.upsert({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_456',
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
    });

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).resolves.toBeNull();
    await expect(
      repo.findByStripeSubscriptionId('sub_456'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });
  });

  it('throws CONFLICT when a stripeSubscriptionId is reused for a different user', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: 'user_2',
        stripeSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'Stripe subscription id is already mapped to a different user',
      ),
    );
  });
});

describe('FakeAuthGateway', () => {
  it('returns null from getCurrentUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.getCurrentUser()).resolves.toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.requireUser()).rejects.toEqual(
      new ApplicationError('UNAUTHENTICATED', 'User not authenticated'),
    );
  });
});

describe('FakePaymentGateway', () => {
  it('returns configured checkout/portal URLs and records inputs', async () => {
    const gateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://fake/checkout',
      portalUrl: 'https://fake/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    await expect(
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ stripeCustomerId: 'cus_test' });

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        stripeCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://fake/checkout' });

    await expect(
      gateway.createPortalSession({
        stripeCustomerId: 'cus_123',
        returnUrl: 'https://app/return',
      }),
    ).resolves.toEqual({ url: 'https://fake/portal' });

    await expect(gateway.processWebhookEvent('raw', 'sig')).resolves.toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });

    expect(gateway.customerInputs).toHaveLength(1);
    expect(gateway.checkoutInputs).toHaveLength(1);
    expect(gateway.portalInputs).toHaveLength(1);
    expect(gateway.webhookInputs).toEqual([
      { rawBody: 'raw', signature: 'sig' },
    ]);
  });
});
