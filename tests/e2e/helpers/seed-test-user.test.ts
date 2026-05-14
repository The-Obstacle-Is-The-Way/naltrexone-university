import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SeedTestSubscription =
  typeof import('./seed-test-user').seedTestSubscription;

function createEnv(): Record<string, string> {
  return {
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    STRIPE_SECRET_KEY: 'sk_test_123',
    CLERK_SECRET_KEY: 'sk_clerk_123',
    E2E_CLERK_USER_USERNAME: 'e2e-test@addictionboards.com',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
  };
}

function createSqlClient(results: unknown[]) {
  const queuedResults = [...results];
  const sql = vi.fn(async () => queuedResults.shift() ?? []);

  return Object.assign(sql, {
    end: vi.fn(async () => {}),
  });
}

describe('seedTestSubscription', () => {
  let seedTestSubscription: SeedTestSubscription;
  let postgresMock: ReturnType<typeof vi.fn>;
  let customersCreate: ReturnType<typeof vi.fn>;
  let subscriptionsList: ReturnType<typeof vi.fn>;
  let subscriptionsCreate: ReturnType<typeof vi.fn>;
  let subscriptionsUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();

    for (const [key, value] of Object.entries(createEnv())) {
      vi.stubEnv(key, value);
    }

    const sqlClient = createSqlClient([[{ id: 'user_123' }], [], [], [], []]);
    postgresMock = vi.fn(() => sqlClient);
    vi.doMock('postgres', () => ({
      default: postgresMock,
    }));

    customersCreate = vi.fn(async () => ({ id: 'cus_123' }));
    subscriptionsCreate = vi.fn(async () => ({
      id: 'sub_123',
      items: {
        data: [
          {
            current_period_end: 1_800_000_000,
          },
        ],
      },
    }));
    subscriptionsList = vi.fn(async () => ({ data: [] }));
    subscriptionsUpdate = vi.fn(async () => ({}));
    const stripeClient = {
      customers: {
        list: vi.fn(async () => ({ data: [] })),
        create: customersCreate,
        retrieve: vi.fn(async () => ({
          id: 'cus_123',
          invoice_settings: {},
        })),
        update: vi.fn(async () => ({})),
      },
      paymentMethods: {
        attach: vi.fn(async () => ({ id: 'pm_123' })),
      },
      subscriptions: {
        list: subscriptionsList,
        cancel: vi.fn(async () => ({})),
        create: subscriptionsCreate,
        update: subscriptionsUpdate,
      },
    };
    const StripeMock = vi.fn(function StripeConstructor() {
      return stripeClient;
    });
    vi.doMock('stripe', () => ({
      default: StripeMock,
    }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'clerk_user_123' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    ({ seedTestSubscription } = await import('./seed-test-user'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('creates E2E Stripe customer and subscription with user metadata', async () => {
    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).toHaveBeenCalledWith({
      email: 'e2e-test@addictionboards.com',
      metadata: {
        user_id: 'user_123',
        clerk_user_id: 'clerk_user_123',
      },
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      items: [{ price: 'price_monthly' }],
      metadata: {
        user_id: 'user_123',
      },
    });
  });

  it('repairs reused active E2E subscriptions that are missing user metadata', async () => {
    subscriptionsList.mockResolvedValueOnce({
      data: [
        {
          id: 'sub_existing',
          status: 'active',
          metadata: {},
          items: {
            data: [
              {
                current_period_end: 1_800_000_000,
              },
            ],
          },
        },
      ],
    });

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(subscriptionsCreate).not.toHaveBeenCalled();
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_existing', {
      metadata: {
        user_id: 'user_123',
      },
    });
  });
});
