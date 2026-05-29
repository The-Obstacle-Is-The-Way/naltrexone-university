import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCustomer } from './stripe-customers';

const appUserId = crypto.randomUUID();

describe('createStripeCustomer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns externalCustomerId when a matching Stripe customer exists', async () => {
    const makeRequest = vi.fn(async (_params: unknown) => ({
      data: [{ id: 'cus_123' }],
    }));

    const customers = {
      _makeRequest: makeRequest,
      create: vi.fn(async () => ({ id: 'cus_new' })),
      search: function (
        this: { _makeRequest: typeof makeRequest },
        params: unknown,
      ) {
        return this._makeRequest(params);
      },
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    await expect(
      createStripeCustomer({
        stripe,
        input: {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(makeRequest).toHaveBeenCalledWith({
      query: `metadata['user_id']:'${appUserId}'`,
      limit: 2,
    });
    expect(customers.create).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR when userId contains unsupported search characters', async () => {
    const customers = {
      create: vi.fn(async () => ({ id: 'cus_new' })),
      search: vi.fn(async () => ({ data: [] })),
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    await expect(
      createStripeCustomer({
        stripe,
        input: {
          userId: "user_'1",
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(customers.search).not.toHaveBeenCalled();
    expect(customers.create).not.toHaveBeenCalled();
  });

  it('creates a new customer when metadata search returns no matches', async () => {
    const customers = {
      create: vi.fn(async () => ({ id: 'cus_new' })),
      search: vi.fn(async () => ({ data: [] })),
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    await expect(
      createStripeCustomer({
        stripe,
        input: {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_new' });

    expect(customers.search).toHaveBeenCalledTimes(1);
    expect(customers.create).toHaveBeenCalledTimes(1);
  });

  it('throws STRIPE_ERROR when metadata search returns multiple matches', async () => {
    const customers = {
      create: vi.fn(async () => ({ id: 'cus_new' })),
      search: vi.fn(async () => ({ data: [{ id: 'cus_1' }, { id: 'cus_2' }] })),
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    await expect(
      createStripeCustomer({
        stripe,
        input: {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Multiple Stripe customers found for this user',
    });

    expect(customers.create).not.toHaveBeenCalled();
  });

  it('throws STRIPE_ERROR when Stripe customer creation returns no id', async () => {
    const customers = {
      create: vi.fn(async () => ({ id: '' })),
      search: vi.fn(async () => ({ data: [] })),
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    await expect(
      createStripeCustomer({
        stripe,
        input: {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe customer id is missing',
    });
  });

  it('forwards idempotency key to Stripe customer creation', async () => {
    const customers = {
      create: vi.fn(async () => ({ id: 'cus_new' })),
      search: vi.fn(async () => ({ data: [] })),
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    await expect(
      createStripeCustomer({
        stripe,
        input: {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        options: { idempotencyKey: 'idem_customer_create_1' },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_new' });

    expect(customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
      }),
      {
        idempotencyKey: 'idem_customer_create_1',
      },
    );
  });

  it('retries Stripe customer creation when no idempotency key is provided', async () => {
    vi.useFakeTimers();

    const customers = {
      create: vi
        .fn<
          (
            _params: unknown,
            _options?: { idempotencyKey?: string },
          ) => Promise<{ id: string }>
        >()
        .mockRejectedValueOnce(
          Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' }),
        )
        .mockResolvedValueOnce({ id: 'cus_retry' }),
    };

    const stripe = { customers } as unknown as Parameters<
      typeof createStripeCustomer
    >[0]['stripe'];

    const promise = createStripeCustomer({
      stripe,
      input: {
        userId: appUserId,
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      },
      logger: new FakeLogger(),
    });

    const expectation = expect(promise).resolves.toEqual({
      externalCustomerId: 'cus_retry',
    });

    await Promise.all([vi.runAllTimersAsync(), expectation]);
    expect(customers.create).toHaveBeenCalledTimes(2);

    const firstOptions = customers.create.mock.calls[0]?.[1] as
      | { idempotencyKey?: string }
      | undefined;
    const secondOptions = customers.create.mock.calls[1]?.[1] as
      | { idempotencyKey?: string }
      | undefined;

    expect(firstOptions).toMatchObject({
      idempotencyKey: `create_stripe_customer:${appUserId}`,
    });
    expect(secondOptions).toEqual(firstOptions);
  });
});
