import { describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

const setupParams = {
  mode: 'setup',
  currency: 'usd',
  success_url: 'https://app.example.com/success',
  cancel_url: 'https://app.example.com/cancel',
} satisfies CheckoutSessionCreateParams;

const subscriptionParams = {
  mode: 'subscription',
  customer: 'cus_test',
  line_items: [{ price: 'price_monthly', quantity: 1 }],
  success_url: 'https://app.example.com/success',
  cancel_url: 'https://app.example.com/cancel',
} satisfies CheckoutSessionCreateParams;

const modeParams = [
  ['setup', setupParams],
  ['subscription', subscriptionParams],
] as const;

describe('FakeStripeCheckoutClient', () => {
  it.each(modeParams)(
    'creates open %s Checkout Sessions',
    async (mode, params) => {
      const stripe = new FakeStripeCheckoutClient();

      const session = await stripe.checkout.sessions.create(params, {
        idempotencyKey: `key_${mode}`,
      });

      expect(session).toMatchObject({
        mode,
        status: 'open',
        url: expect.any(String),
        expires_at: expect.any(Number),
      });
    },
  );

  it('omits payment_method_collection when subscription params do not set it', async () => {
    const stripe = new FakeStripeCheckoutClient();

    const session = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_subscription',
    });

    expect(session).not.toHaveProperty('payment_method_collection');
  });

  it.each(modeParams)(
    'replays the frozen first %s response while retrieve exposes completed live state',
    async (mode, params) => {
      const stripe = new FakeStripeCheckoutClient();
      const options = { idempotencyKey: `key_${mode}` };
      const first = await stripe.checkout.sessions.create(params, options);

      stripe.markComplete(first.id);

      await expect(
        stripe.checkout.sessions.create(params, options),
      ).resolves.toEqual(first);
      await expect(
        stripe.checkout.sessions.retrieve(first.id),
      ).resolves.toEqual(
        expect.objectContaining({
          id: first.id,
          status: 'complete',
          url: null,
        }),
      );
    },
  );

  it.each(modeParams)(
    'marks only the mutable live %s snapshot expired',
    async (mode, params) => {
      const stripe = new FakeStripeCheckoutClient();
      const options = { idempotencyKey: `key_${mode}` };
      const first = await stripe.checkout.sessions.create(params, options);

      stripe.markExpired(first.id);

      await expect(
        stripe.checkout.sessions.retrieve(first.id),
      ).resolves.toEqual(
        expect.objectContaining({
          id: first.id,
          status: 'expired',
          url: null,
        }),
      );
      await expect(
        stripe.checkout.sessions.create(params, options),
      ).resolves.toEqual(first);
    },
  );

  it('supports explicit retrieve fault injection without changing the saved response', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const options = { idempotencyKey: 'key_setup' };
    const first = await stripe.checkout.sessions.create(setupParams, options);
    stripe.setRetrieveOverride((session) => ({
      ...session,
      id: 'cs_mismatched',
    }));

    await expect(stripe.checkout.sessions.retrieve(first.id)).resolves.toEqual(
      expect.objectContaining({ id: 'cs_mismatched' }),
    );
    await expect(
      stripe.checkout.sessions.create(setupParams, options),
    ).resolves.toEqual(first);
  });

  it('supports explicit create fault injection without saving a response', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const options = { idempotencyKey: 'key_fault' };
    const fault = new Error('Stripe checkout configuration failed');
    stripe.setCreateFault(() => {
      throw fault;
    });

    await expect(
      stripe.checkout.sessions.create(setupParams, options),
    ).rejects.toBe(fault);
    stripe.setCreateFault(null);

    const created = await stripe.checkout.sessions.create(setupParams, options);
    expect(created).toMatchObject({ id: 'cs_fake_1', status: 'open' });
    expect(stripe.createCalls).toHaveLength(2);
  });

  it('records retrieve params and expire options beside the ids', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const created = await stripe.checkout.sessions.create(setupParams, {
      idempotencyKey: 'key_recorded',
    });

    await stripe.checkout.sessions.retrieve(created.id, {
      expand: ['line_items'],
    });
    await stripe.checkout.sessions.expire(created.id, undefined, {
      idempotencyKey: `expire_checkout_session:${created.id}`,
    });

    expect(stripe.retrieveRequests).toEqual([
      { sessionId: created.id, params: { expand: ['line_items'] } },
    ]);
    expect(stripe.expireCalls).toEqual([
      {
        sessionId: created.id,
        options: { idempotencyKey: `expire_checkout_session:${created.id}` },
      },
    ]);
    await expect(
      stripe.checkout.sessions.retrieve(created.id),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'expired', url: null }),
    );
  });

  it('supports explicit expire fault injection without changing the live state', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const created = await stripe.checkout.sessions.create(setupParams, {
      idempotencyKey: 'key_expire_fault',
    });
    const fault = new Error('expire transport failed');
    stripe.setExpireFault(() => {
      throw fault;
    });

    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, {
        idempotencyKey: `expire_checkout_session:${created.id}`,
      }),
    ).rejects.toBe(fault);

    expect(stripe.expireCalls).toEqual([
      {
        sessionId: created.id,
        options: { idempotencyKey: `expire_checkout_session:${created.id}` },
      },
    ]);
    await expect(
      stripe.checkout.sessions.retrieve(created.id),
    ).resolves.toEqual(expect.objectContaining({ status: 'open' }));
  });

  it('lists seeded Subscriptions by customer and status and retrieves them by id', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedSubscription({
      id: 'sub_fake_1',
      customer: 'cus_one',
      status: 'active',
      metadata: { user_id: 'user_one' },
      items: {
        data: [
          {
            current_period_end: 1_700_003_600,
            price: { id: 'price_contract' },
          },
        ],
      },
    });
    stripe.seedSubscription({
      id: 'sub_fake_2',
      customer: 'cus_one',
      status: 'canceled',
    });
    stripe.seedSubscription({
      id: 'sub_fake_3',
      customer: 'cus_two',
      status: 'active',
    });
    const list = stripe.subscriptions.list;
    if (!list) throw new Error('Expected the fake to list Subscriptions');

    await expect(
      stripe.subscriptions.list?.({
        customer: 'cus_one',
        status: 'all',
        limit: 10,
      }),
    ).resolves.toEqual({
      data: [
        expect.objectContaining({ id: 'sub_fake_1', status: 'active' }),
        expect.objectContaining({ id: 'sub_fake_2', status: 'canceled' }),
      ],
    });
    await expect(
      stripe.subscriptions.list?.({ customer: 'cus_one', status: 'active' }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ id: 'sub_fake_1', status: 'active' })],
    });
    // As on Stripe, an omitted status lists every Subscription except the
    // canceled ones; only `status: 'all'` includes them.
    await expect(
      stripe.subscriptions.list?.({ customer: 'cus_one' }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ id: 'sub_fake_1', status: 'active' })],
    });
    expect(stripe.subscriptions.listCalls).toEqual([
      { customer: 'cus_one', status: 'all', limit: 10 },
      { customer: 'cus_one', status: 'active' },
      { customer: 'cus_one' },
    ]);
    await expect(stripe.subscriptions.retrieve('sub_fake_1')).resolves.toEqual(
      expect.objectContaining({
        id: 'sub_fake_1',
        customer: 'cus_one',
        status: 'active',
      }),
    );
    await expect(stripe.subscriptions.retrieve('sub_missing')).rejects.toThrow(
      'Missing fake Subscription: sub_missing',
    );
    // Detached like an unbound SDK method, the list has no `this` to read.
    await expect(list({ customer: 'cus_one' })).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  function fakeWithActiveSubscription(): FakeStripeCheckoutClient {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedSubscription({
      id: 'sub_fake_1',
      customer: 'cus_one',
      status: 'active',
    });
    return stripe;
  }

  it('cancels a seeded Subscription, which stays retrievable and leaves the default listing', async () => {
    const stripe = fakeWithActiveSubscription();

    await expect(stripe.subscriptions.cancel('sub_fake_1')).resolves.toEqual(
      expect.objectContaining({ id: 'sub_fake_1', status: 'canceled' }),
    );
    await expect(stripe.subscriptions.retrieve('sub_fake_1')).resolves.toEqual(
      expect.objectContaining({ status: 'canceled' }),
    );
    await expect(
      stripe.subscriptions.list?.({ customer: 'cus_one' }),
    ).resolves.toEqual({ data: [] });
  });

  // Stripe answers a second cancel (and an unknown id) with a 404 that names
  // the Subscription missing, although a canceled one is still retrievable.
  it.each([
    ['a repeat cancel', 'sub_fake_1'],
    ['an unknown id', 'sub_unknown'],
  ])('rejects %s as resource_missing', async (_case, subscriptionId) => {
    const stripe = fakeWithActiveSubscription();
    await stripe.subscriptions.cancel('sub_fake_1');

    await expect(
      stripe.subscriptions.cancel(subscriptionId),
    ).rejects.toMatchObject({
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      code: 'resource_missing',
      statusCode: 404,
      param: 'id',
      message: `No such subscription: '${subscriptionId}'`,
    });
  });

  it('records each cancel with a copy of its options', async () => {
    const stripe = fakeWithActiveSubscription();
    const options = { idempotencyKey: 'reconcile_duplicate_subscription:x' };

    await stripe.subscriptions.cancel('sub_fake_1', undefined, options);
    await expect(
      stripe.subscriptions.cancel('sub_fake_1'),
    ).rejects.toMatchObject({ code: 'resource_missing' });
    options.idempotencyKey = 'changed_after_the_call';

    expect(stripe.subscriptions.cancelCalls).toEqual([
      {
        subscriptionId: 'sub_fake_1',
        options: { idempotencyKey: 'reconcile_duplicate_subscription:x' },
      },
      { subscriptionId: 'sub_fake_1' },
    ]);
  });

  it('fails a detached cancel the way an unbound SDK method would', async () => {
    const stripe = fakeWithActiveSubscription();
    const cancel = stripe.subscriptions.cancel;

    await expect(cancel('sub_fake_1')).rejects.toBeInstanceOf(TypeError);
  });

  it('supports create-response overrides without changing the stored Session', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const options = { idempotencyKey: 'key_response_override' };
    // The override mutates what it is handed, so the case also proves the
    // saved replay and the stored Session are clones it cannot reach.
    stripe.setCreateResponseOverride((session) => {
      session.url = null;
      return session;
    });

    const created = await stripe.checkout.sessions.create(setupParams, options);

    expect(created.url).toBeNull();
    await expect(
      stripe.checkout.sessions.create(setupParams, options),
    ).resolves.toEqual(expect.objectContaining({ id: created.id, url: null }));
    stripe.setCreateResponseOverride(null);
    await expect(
      stripe.checkout.sessions.create(setupParams, options),
    ).resolves.toEqual(
      expect.objectContaining({ id: created.id, url: expect.any(String) }),
    );
    await expect(
      stripe.checkout.sessions.retrieve(created.id),
    ).resolves.toEqual(
      expect.objectContaining({ id: created.id, url: expect.any(String) }),
    );
  });

  it('awaits the list hook before answering a listing', async () => {
    const stripe = new FakeStripeCheckoutClient();
    await stripe.checkout.sessions.create(setupParams, {
      idempotencyKey: 'key_hooked',
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    let recordedWhenHookRan: unknown[] = [];
    stripe.setListHook(async () => {
      // The call is recorded before the hook runs, so a hook can inspect it.
      recordedWhenHookRan = [...stripe.listCalls];
      order.push('hook');
      await released;
    });

    const listing = stripe.checkout.sessions
      .list({ customer: 'cus_fake_checkout', limit: 10 })
      .then((result) => {
        order.push('listed');
        return result;
      });
    await Promise.resolve();
    order.push('release');
    release();

    await expect(listing).resolves.toEqual(
      expect.objectContaining({ has_more: false }),
    );
    expect(order).toEqual(['hook', 'release', 'listed']);
    expect(recordedWhenHookRan).toEqual([
      { customer: 'cus_fake_checkout', limit: 10 },
    ]);
    expect(stripe.listCalls).toEqual([
      { customer: 'cus_fake_checkout', limit: 10 },
    ]);
  });

  it('hands back an injected webhook event and records the verification call', async () => {
    const stripe = new FakeStripeCheckoutClient();
    expect(() =>
      stripe.webhooks.constructEvent('{}', 'sig_none', 'whsec_none'),
    ).toThrow('FakeStripeCheckoutClient does not process webhooks');
    stripe.setWebhookEvent({
      id: 'evt_fake',
      type: 'charge.refunded',
      data: { object: { id: 'ch_fake' } },
    });

    expect(
      stripe.webhooks.constructEvent('{"a":1}', 'sig_a', 'whsec_a'),
    ).toEqual({
      id: 'evt_fake',
      type: 'charge.refunded',
      data: { object: { id: 'ch_fake' } },
    });
    expect(stripe.webhookCalls).toEqual([
      { rawBody: '{}', signature: 'sig_none', secret: 'whsec_none' },
      { rawBody: '{"a":1}', signature: 'sig_a', secret: 'whsec_a' },
    ]);
  });

  it('retrieves seeded SetupIntents by id and records the calls', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedSetupIntent({ id: 'seti_fake', payment_method: 'pm_fake' });

    await expect(stripe.setupIntents.retrieve('seti_fake')).resolves.toEqual({
      id: 'seti_fake',
      payment_method: 'pm_fake',
    });
    await expect(stripe.setupIntents.retrieve('seti_missing')).rejects.toThrow(
      'Missing fake SetupIntent: seti_missing',
    );
    expect(stripe.setupIntents.retrieveCalls).toEqual([
      'seti_fake',
      'seti_missing',
    ]);
  });

  it('lists terminal and open Sessions in reverse chronology with cursor pagination', async () => {
    let nowMs = Date.UTC(2026, 7, 17, 12, 0, 0);
    const stripe = new FakeStripeCheckoutClient(() => nowMs);
    const first = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_first',
    });
    stripe.markComplete(first.id);
    nowMs += 1_000;
    const second = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_second',
    });
    stripe.markExpired(second.id);
    nowMs += 1_000;
    const third = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_third',
    });
    const firstPage = await stripe.checkout.sessions.list({
      customer: 'cus_test',
      limit: 2,
    });
    const secondPage = await stripe.checkout.sessions.list({
      customer: 'cus_test',
      limit: 2,
      starting_after: second.id,
    });

    expect(firstPage).toMatchObject({
      data: [
        { id: third.id, status: 'open' },
        { id: second.id, status: 'expired' },
      ],
      has_more: true,
    });
    expect(secondPage).toMatchObject({
      data: [{ id: first.id, status: 'complete' }],
      has_more: false,
    });
  });

  it('rejects reuse of an idempotency key with different create parameters', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const options = { idempotencyKey: 'key_subscription' };
    await stripe.checkout.sessions.create(subscriptionParams, options);

    const action = stripe.checkout.sessions.create(
      {
        ...subscriptionParams,
        success_url: 'https://app.example.com/a-different-success',
      },
      options,
    );

    await expect(action).rejects.toMatchObject({
      rawType: 'idempotency_error',
      statusCode: 400,
    });
  });
});
