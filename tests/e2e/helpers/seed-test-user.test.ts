import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fixtureOtherUserId, fixtureUser123Id } = vi.hoisted(() => ({
  fixtureOtherUserId: crypto.randomUUID(),
  fixtureUser123Id: crypto.randomUUID(),
}));

type SeedTestSubscription =
  typeof import('./seed-test-user').seedTestSubscription;

function createEnv(): Record<string, string> {
  return {
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    STRIPE_SECRET_KEY: 'sk_test_123',
    CLERK_SECRET_KEY: 'sk_clerk_123',
    E2E_CLERK_USER_USERNAME: 'e2e-test@addictionboards.com',
    E2E_STRIPE_OWNER: 'github-ci',
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

function createStripeList<T>(firstPage: T[], allPages = firstPage) {
  return {
    data: firstPage,
    async *[Symbol.asyncIterator]() {
      for (const item of allPages) {
        yield item;
      }
    },
  };
}

describe('seedTestSubscription', () => {
  let seedTestSubscription: SeedTestSubscription;
  let postgresMock: ReturnType<typeof vi.fn>;
  let customersList: ReturnType<typeof vi.fn>;
  let customersCreate: ReturnType<typeof vi.fn>;
  let customersRetrieve: ReturnType<typeof vi.fn>;
  let subscriptionsList: ReturnType<typeof vi.fn>;
  let subscriptionsCancel: ReturnType<typeof vi.fn>;
  let subscriptionsCreate: ReturnType<typeof vi.fn>;
  let subscriptionsUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();

    for (const [key, value] of Object.entries(createEnv())) {
      vi.stubEnv(key, value);
    }

    const sqlClient = createSqlClient([
      [{ id: fixtureUser123Id }],
      [],
      [],
      [],
      [],
    ]);
    postgresMock = vi.fn(() => sqlClient);
    vi.doMock('postgres', () => ({
      default: postgresMock,
    }));

    customersCreate = vi.fn(async () => ({ id: 'cus_123' }));
    customersList = vi.fn(() => createStripeList([]));
    customersRetrieve = vi.fn(async () => ({
      id: 'cus_123',
      invoice_settings: {},
    }));
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
    subscriptionsList = vi.fn(() => createStripeList([]));
    subscriptionsCancel = vi.fn(async () => ({}));
    subscriptionsUpdate = vi.fn(async () => ({}));
    const stripeClient = {
      customers: {
        list: customersList,
        create: customersCreate,
        retrieve: customersRetrieve,
        update: vi.fn(async () => ({})),
      },
      paymentMethods: {
        attach: vi.fn(async () => ({ id: 'pm_123' })),
      },
      subscriptions: {
        list: subscriptionsList,
        cancel: subscriptionsCancel,
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

  it('refuses to seed when E2E_STRIPE_OWNER is unset and STRIPE_SECRET_KEY is non-dummy', async () => {
    vi.stubEnv('E2E_STRIPE_OWNER', '');

    await expect(seedTestSubscription()).rejects.toThrow(
      'E2E_STRIPE_OWNER is required when STRIPE_SECRET_KEY is real',
    );

    expect(postgresMock).not.toHaveBeenCalled();
  });

  it('falls back to local-dev owner only when Stripe credentials are dummy', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
    vi.stubEnv('E2E_STRIPE_OWNER', '');

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).toHaveBeenCalledWith({
      email: 'e2e-test@addictionboards.com',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'local-dev',
      },
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          user_id: fixtureUser123Id,
          e2e_owner: 'local-dev',
        },
      }),
    );
  });

  it('uses the shared dummy-key definition for alternate placeholders', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy_placeholder');
    vi.stubEnv('E2E_STRIPE_OWNER', '');

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ e2e_owner: 'local-dev' }),
      }),
    );
  });

  it('creates E2E Stripe customer and subscription with owner-scoped metadata', async () => {
    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).toHaveBeenCalledWith({
      email: 'e2e-test@addictionboards.com',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'github-ci',
      },
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      items: [{ price: 'price_monthly' }],
      metadata: {
        user_id: fixtureUser123Id,
        e2e_owner: 'github-ci',
      },
    });
  });

  it('refuses to seed when required environment is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(seedTestSubscription()).rejects.toThrow(
      'Missing required env vars for E2E subscription seeding',
    );

    expect(postgresMock).not.toHaveBeenCalled();
    expect(customersCreate).not.toHaveBeenCalled();
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it('throws when the Clerk user cannot be resolved', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(seedTestSubscription()).rejects.toThrow(
      'No Clerk user found for email e2e-test@addictionboards.com',
    );

    expect(customersCreate).not.toHaveBeenCalled();
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it('throws when the local E2E user upsert returns no row', async () => {
    postgresMock.mockReturnValueOnce(createSqlClient([[]]));

    await expect(seedTestSubscription()).rejects.toThrow(
      'Failed to upsert E2E database user',
    );

    expect(customersCreate).not.toHaveBeenCalled();
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it('throws when a reused active Stripe subscription has no item', async () => {
    subscriptionsList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'sub_without_items',
          status: 'active',
          metadata: {
            user_id: fixtureUser123Id,
            e2e_owner: 'github-ci',
          },
          items: {
            data: [],
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).rejects.toThrow(
      'Active Stripe subscription has no items',
    );

    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it('throws when a created Stripe subscription has no item', async () => {
    subscriptionsCreate.mockResolvedValueOnce({
      id: 'sub_without_items',
      items: {
        data: [],
      },
    });

    await expect(seedTestSubscription()).rejects.toThrow(
      'Created Stripe subscription has no items',
    );
  });

  it('reuses an owner-scoped DB-mapped customer and returns early when local subscription is still active', async () => {
    postgresMock.mockReturnValueOnce(
      createSqlClient([
        [{ id: fixtureUser123Id }],
        [{ stripe_customer_id: 'cus_existing' }],
        [
          {
            stripe_subscription_id: 'sub_existing',
            status: 'active',
            current_period_end: '2999-01-01T00:00:00.000Z',
          },
        ],
      ]),
    );
    customersRetrieve.mockResolvedValueOnce({
      id: 'cus_existing',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'github-ci',
      },
      invoice_settings: {},
    });

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersRetrieve).toHaveBeenCalledWith('cus_existing');
    expect(customersList).not.toHaveBeenCalled();
    expect(subscriptionsList).not.toHaveBeenCalled();
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it('reconciles Stripe when the DB customer is remapped even if a local subscription row is active', async () => {
    postgresMock.mockReturnValueOnce(
      createSqlClient([
        [{ id: fixtureUser123Id }],
        [{ stripe_customer_id: 'cus_other_owner' }],
        [],
        [
          {
            stripe_subscription_id: 'sub_stale_local',
            status: 'active',
            current_period_end: '2999-01-01T00:00:00.000Z',
          },
        ],
        [],
      ]),
    );
    customersRetrieve.mockResolvedValueOnce({
      id: 'cus_other_owner',
      metadata: {
        user_id: fixtureOtherUserId,
        clerk_user_id: 'other_clerk',
        e2e_owner: 'local-dev',
      },
      invoice_settings: {},
    });
    customersRetrieve.mockResolvedValueOnce({
      id: 'cus_current_owner',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'github-ci',
      },
      invoice_settings: {},
    });
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_current_owner',
          metadata: {
            user_id: fixtureUser123Id,
            clerk_user_id: 'clerk_user_123',
            e2e_owner: 'github-ci',
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersRetrieve).toHaveBeenCalledWith('cus_other_owner');
    expect(customersList).toHaveBeenCalledWith({
      email: 'e2e-test@addictionboards.com',
      limit: 100,
    });
    expect(subscriptionsList).toHaveBeenCalledWith({
      customer: 'cus_current_owner',
      limit: 100,
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith({
      customer: 'cus_current_owner',
      items: [{ price: 'price_monthly' }],
      metadata: {
        user_id: fixtureUser123Id,
        e2e_owner: 'github-ci',
      },
    });
  });

  it('does not reuse a Stripe customer found by email when its metadata.e2e_owner differs from current owner', async () => {
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_other_owner',
          metadata: {
            user_id: fixtureOtherUserId,
            clerk_user_id: 'other_clerk',
            e2e_owner: 'local-dev',
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).toHaveBeenCalledWith({
      email: 'e2e-test@addictionboards.com',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'github-ci',
      },
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
      }),
    );
  });

  it('creates a new owner-scoped customer when none match the current owner', async () => {
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_without_owner',
          metadata: {
            user_id: 'legacy_user',
          },
        },
        {
          id: 'cus_other_owner',
          metadata: {
            user_id: fixtureOtherUserId,
            e2e_owner: 'local-dev',
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).toHaveBeenCalledWith({
      email: 'e2e-test@addictionboards.com',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'github-ci',
      },
    });
  });

  it('cancels non-active subscriptions only when they match the current owner', async () => {
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_current_owner',
          metadata: {
            user_id: fixtureUser123Id,
            clerk_user_id: 'clerk_user_123',
            e2e_owner: 'github-ci',
          },
        },
      ]),
    );
    subscriptionsList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'sub_canceled_current_owner',
          status: 'canceled',
          metadata: {
            user_id: fixtureUser123Id,
            e2e_owner: 'github-ci',
          },
          items: {
            data: [
              {
                current_period_end: 1_700_000_000,
              },
            ],
          },
        },
        {
          id: 'sub_canceled_other_owner',
          status: 'canceled',
          metadata: {
            user_id: fixtureOtherUserId,
            e2e_owner: 'local-dev',
          },
          items: {
            data: [
              {
                current_period_end: 1_700_000_000,
              },
            ],
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(subscriptionsCancel).toHaveBeenCalledWith(
      'sub_canceled_current_owner',
    );
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_current_owner',
      }),
    );
  });

  it('does not patch metadata.user_id on an active subscription whose metadata.e2e_owner differs from current owner', async () => {
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_current_owner',
          metadata: {
            user_id: fixtureUser123Id,
            clerk_user_id: 'clerk_user_123',
            e2e_owner: 'github-ci',
          },
        },
      ]),
    );
    subscriptionsList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'sub_other_owner',
          status: 'active',
          metadata: {
            user_id: fixtureOtherUserId,
            e2e_owner: 'local-dev',
          },
          items: {
            data: [
              {
                current_period_end: 1_800_000_000,
              },
            ],
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(subscriptionsUpdate).not.toHaveBeenCalled();
    expect(subscriptionsCreate).toHaveBeenCalledWith({
      customer: 'cus_current_owner',
      items: [{ price: 'price_monthly' }],
      metadata: {
        user_id: fixtureUser123Id,
        e2e_owner: 'github-ci',
      },
    });
  });

  it('reuses a same-owner active subscription and patches its user_id when DB-local user differs', async () => {
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_current_owner',
          metadata: {
            user_id: 'old_user',
            clerk_user_id: 'clerk_user_123',
            e2e_owner: 'github-ci',
          },
        },
      ]),
    );
    subscriptionsList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'sub_existing',
          status: 'active',
          metadata: {
            user_id: 'old_user',
            e2e_owner: 'github-ci',
          },
          items: {
            data: [
              {
                current_period_end: 1_800_000_000,
              },
            ],
          },
        },
      ]),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(subscriptionsCreate).not.toHaveBeenCalled();
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_existing', {
      metadata: {
        user_id: fixtureUser123Id,
        e2e_owner: 'github-ci',
      },
    });
  });

  it('finds an owner-scoped customer beyond the first Stripe list page', async () => {
    const firstPageCustomer = {
      id: 'cus_other_owner',
      metadata: {
        user_id: fixtureOtherUserId,
        clerk_user_id: 'other_clerk',
        e2e_owner: 'local-dev',
      },
    };
    const secondPageCustomer = {
      id: 'cus_second_page_current_owner',
      metadata: {
        user_id: fixtureUser123Id,
        clerk_user_id: 'clerk_user_123',
        e2e_owner: 'github-ci',
      },
    };
    customersList.mockReturnValueOnce(
      createStripeList(
        [firstPageCustomer],
        [firstPageCustomer, secondPageCustomer],
      ),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(customersCreate).not.toHaveBeenCalled();
    expect(subscriptionsList).toHaveBeenCalledWith({
      customer: 'cus_second_page_current_owner',
      limit: 100,
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_second_page_current_owner',
      }),
    );
  });

  it('reuses an active owner-scoped subscription beyond the first Stripe list page', async () => {
    const firstPageSubscription = {
      id: 'sub_first_page_other_owner',
      status: 'active',
      metadata: {
        user_id: fixtureOtherUserId,
        e2e_owner: 'local-dev',
      },
      items: {
        data: [
          {
            current_period_end: 1_800_000_000,
          },
        ],
      },
    };
    const secondPageSubscription = {
      id: 'sub_second_page_current_owner',
      status: 'active',
      metadata: {
        user_id: fixtureUser123Id,
        e2e_owner: 'github-ci',
      },
      items: {
        data: [
          {
            current_period_end: 1_800_000_000,
          },
        ],
      },
    };
    customersList.mockReturnValueOnce(
      createStripeList([
        {
          id: 'cus_current_owner',
          metadata: {
            user_id: fixtureUser123Id,
            clerk_user_id: 'clerk_user_123',
            e2e_owner: 'github-ci',
          },
        },
      ]),
    );
    subscriptionsList.mockReturnValueOnce(
      createStripeList(
        [firstPageSubscription],
        [firstPageSubscription, secondPageSubscription],
      ),
    );

    await expect(seedTestSubscription()).resolves.toBeUndefined();

    expect(subscriptionsCreate).not.toHaveBeenCalled();
    expect(subscriptionsUpdate).not.toHaveBeenCalled();
  });
});
