import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCustomer } from './stripe-customers';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const appUserId = crypto.randomUUID();

describe('createStripeCustomer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The fake's Search, like the SDK's, needs its receiver, so these cases also
  // pin the adapter's binding of the detached method.
  it('returns externalCustomerId when a matching Stripe customer exists', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const existingId = stripe.seedCustomer({ user_id: appUserId });
    const create = vi.spyOn(stripe.customers, 'create');

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
    ).resolves.toEqual({ externalCustomerId: existingId });

    expect(stripe.customers.searchCalls).toEqual([
      { query: `metadata['user_id']:'${appUserId}'`, limit: 2 },
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR when userId contains unsupported search characters', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const create = vi.spyOn(stripe.customers, 'create');

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

    expect(stripe.customers.searchCalls).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a new customer when metadata search returns no matches', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedCustomer({ user_id: crypto.randomUUID() });
    const create = vi
      .spyOn(stripe.customers, 'create')
      .mockResolvedValue({ id: 'cus_new' });

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

    expect(stripe.customers.searchCalls).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('throws STRIPE_ERROR when metadata search returns multiple matches', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedCustomer({ user_id: appUserId });
    stripe.seedCustomer({ user_id: appUserId });
    const create = vi.spyOn(stripe.customers, 'create');

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

    expect(create).not.toHaveBeenCalled();
  });

  it('throws STRIPE_ERROR when Stripe customer creation returns no id', async () => {
    const stripe = new FakeStripeCheckoutClient();
    vi.spyOn(stripe.customers, 'create').mockResolvedValue({ id: '' });

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

  it('creates the customer with its email and both user ids in metadata', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const create = vi
      .spyOn(stripe.customers, 'create')
      .mockResolvedValue({ id: 'cus_new' });

    await createStripeCustomer({
      stripe,
      input: {
        userId: appUserId,
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      },
      logger: new FakeLogger(),
    });

    expect(create).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        metadata: { user_id: appUserId, clerk_user_id: 'clerk_1' },
      },
      { idempotencyKey: `create_stripe_customer:${appUserId}` },
    );
  });

  it('forwards idempotency key to Stripe customer creation', async () => {
    const stripe = new FakeStripeCheckoutClient();
    vi.spyOn(stripe.customers, 'create').mockResolvedValue({ id: 'cus_new' });

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

    expect(stripe.customers.create).toHaveBeenCalledWith(
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
    const stripe = new FakeStripeCheckoutClient();
    const create = vi
      .spyOn(stripe.customers, 'create')
      .mockRejectedValueOnce(
        Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' }),
      )
      .mockResolvedValueOnce({ id: 'cus_retry' });

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
    expect(create).toHaveBeenCalledTimes(2);

    const firstOptions = create.mock.calls[0]?.[1];
    const secondOptions = create.mock.calls[1]?.[1];

    expect(firstOptions).toMatchObject({
      idempotencyKey: `create_stripe_customer:${appUserId}`,
    });
    expect(secondOptions).toEqual(firstOptions);
  });
});
