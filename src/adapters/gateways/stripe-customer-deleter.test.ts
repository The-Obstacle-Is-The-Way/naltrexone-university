import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { deleteStripeCustomer } from './stripe-customer-deleter';

describe('deleteStripeCustomer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deletes the Stripe customer', async () => {
    const del = vi.fn(async () => ({
      id: 'cus_123',
      object: 'customer' as const,
      deleted: true as const,
    }));

    await deleteStripeCustomer(
      { customers: { del } },
      new FakeLogger(),
      'cus_123',
    );

    expect(del).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith('cus_123');
  });

  it('treats an already-deleted customer response as success', async () => {
    const del = vi.fn(async () => ({
      id: 'cus_deleted',
      object: 'customer' as const,
      deleted: true as const,
    }));

    await expect(
      deleteStripeCustomer(
        { customers: { del } },
        new FakeLogger(),
        'cus_deleted',
      ),
    ).resolves.toBeUndefined();

    expect(del).toHaveBeenCalledOnce();
  });

  it('treats a missing-customer 404 as success', async () => {
    const missingCustomerError = Object.assign(
      new Error('No such customer: cus_missing'),
      {
        statusCode: 404,
        rawType: 'invalid_request_error',
        code: 'resource_missing',
      },
    );
    const del = vi.fn(async () => {
      throw missingCustomerError;
    });
    const logger = new FakeLogger();

    await expect(
      deleteStripeCustomer({ customers: { del } }, logger, 'cus_missing'),
    ).resolves.toBeUndefined();

    expect(del).toHaveBeenCalledOnce();
    expect(logger.infoCalls).toEqual([
      {
        context: { stripeCustomerId: 'cus_missing' },
        msg: 'Stripe customer already deleted or missing',
      },
    ]);
  });

  it('does not open the Stripe circuit for repeated missing-customer done-states', async () => {
    const missingCustomerError = Object.assign(new Error('No such customer'), {
      statusCode: 404,
    });
    const del = vi.fn(async (stripeCustomerId: string) => {
      if (stripeCustomerId.startsWith('cus_missing')) {
        throw missingCustomerError;
      }
      return { id: stripeCustomerId, deleted: true as const };
    });
    const stripe = { customers: { del } };
    const logger = new FakeLogger();

    for (let index = 0; index < 5; index += 1) {
      await expect(
        deleteStripeCustomer(stripe, logger, `cus_missing_${index}`),
      ).resolves.toBeUndefined();
    }

    await expect(
      deleteStripeCustomer(stripe, logger, 'cus_present'),
    ).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledTimes(6);
  });

  it('retries a transient 5xx and propagates the error', async () => {
    vi.useFakeTimers();
    const transientError = Object.assign(new Error('Stripe unavailable'), {
      statusCode: 503,
    });
    const del = vi.fn(async () => {
      throw transientError;
    });
    const logger = new FakeLogger();

    const promise = deleteStripeCustomer(
      { customers: { del } },
      logger,
      'cus_retry',
    );
    const rejection = expect(promise).rejects.toBe(transientError);

    await vi.runAllTimersAsync();
    await rejection;

    expect(del).toHaveBeenCalledTimes(3);
    expect(logger.warnCalls).toHaveLength(2);
  });
});
