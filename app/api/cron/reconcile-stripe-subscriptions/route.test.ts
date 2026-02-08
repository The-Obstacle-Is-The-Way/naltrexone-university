import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reconcileStripeSubscriptions, createContainer } = vi.hoisted(() => ({
  reconcileStripeSubscriptions: vi.fn(),
  createContainer: vi.fn(),
}));

vi.mock('@/src/adapters/jobs/reconcile-stripe-subscriptions', () => ({
  reconcileStripeSubscriptions,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT: 500,
}));

vi.mock('@/lib/container', () => ({
  createContainer,
}));

import { POST } from './route';

describe('POST /api/cron/reconcile-stripe-subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    reconcileStripeSubscriptions.mockResolvedValue({
      scanned: 0,
      updated: 0,
      failed: 0,
      failures: [],
    });

    createContainer.mockReturnValue({
      env: {
        CRON_SECRET: 'test-secret',
        NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
        NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_annual',
      },
      logger: {
        error: vi.fn(),
      },
      stripe: {},
      db: {
        query: {
          stripeSubscriptions: {
            findMany: vi.fn(async () => []),
          },
        },
        transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({}),
        ),
      },
      createStripeCustomerRepository: vi.fn(),
      createSubscriptionRepository: vi.fn(),
    });
  });

  it('clamps request limit to 500 before calling reconciliation', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?limit=750',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileStripeSubscriptions).toHaveBeenCalledWith(
      {
        limit: 500,
        offset: 0,
        dryRun: true,
      },
      expect.any(Object),
    );
  });
});
