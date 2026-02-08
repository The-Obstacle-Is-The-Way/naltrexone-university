import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCustomer } from './stripe-customers';

describe('createStripeCustomer', () => {
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
          userId: 'user_1',
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(makeRequest).toHaveBeenCalledWith({
      query: "metadata['user_id']:'user_1'",
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
});
