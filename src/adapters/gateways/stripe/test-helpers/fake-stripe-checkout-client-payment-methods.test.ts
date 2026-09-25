import { describe, expect, it } from 'vitest';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

// PaymentMethods and Subscription defaults, split from the fake's main suite by
// concern. The contract's eighth and ninth scenarios prove the same rules
// against Stripe TEST mode.
describe('FakeStripeCheckoutClient PaymentMethods and Subscription defaults', () => {
  function fakeWithActiveSubscription(): FakeStripeCheckoutClient {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedSubscription({
      id: 'sub_fake_1',
      customer: 'cus_one',
      status: 'active',
    });
    return stripe;
  }

  it('attaches an unattached PaymentMethod and serves it by id', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: null });

    await expect(
      stripe.paymentMethods.attach(
        'pm_fake_1',
        { customer: 'cus_one' },
        { idempotencyKey: 'key_attach' },
      ),
    ).resolves.toEqual({ id: 'pm_fake_1', customer: 'cus_one' });
    await expect(stripe.paymentMethods.retrieve('pm_fake_1')).resolves.toEqual({
      id: 'pm_fake_1',
      customer: 'cus_one',
    });
    expect(stripe.paymentMethods.attachCalls).toEqual([
      {
        paymentMethodId: 'pm_fake_1',
        customer: 'cus_one',
        options: { idempotencyKey: 'key_attach' },
      },
    ]);
    expect(stripe.paymentMethods.retrieveCalls).toEqual(['pm_fake_1']);
  });

  it('re-attaches a PaymentMethod to its own customer', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: 'cus_one' });

    await expect(
      stripe.paymentMethods.attach('pm_fake_1', { customer: 'cus_one' }),
    ).resolves.toEqual({ id: 'pm_fake_1', customer: 'cus_one' });
  });

  it('rejects attaching a PaymentMethod that is on another customer, as Stripe does', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: 'cus_one' });

    await expect(
      stripe.paymentMethods.attach('pm_fake_1', { customer: 'cus_two' }),
    ).rejects.toMatchObject({
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      statusCode: 400,
      message:
        'The payment method you provided has already been attached to a customer.',
    });
    await expect(stripe.paymentMethods.retrieve('pm_fake_1')).resolves.toEqual({
      id: 'pm_fake_1',
      customer: 'cus_one',
    });
  });

  it('detaches an attached PaymentMethod and records the call', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: 'cus_one' });

    await expect(
      stripe.paymentMethods.detach('pm_fake_1', undefined, {
        idempotencyKey: 'key_detach',
      }),
    ).resolves.toEqual({ id: 'pm_fake_1', customer: null });
    await expect(stripe.paymentMethods.retrieve('pm_fake_1')).resolves.toEqual({
      id: 'pm_fake_1',
      customer: null,
    });
    expect(stripe.paymentMethods.detachCalls).toEqual([
      {
        paymentMethodId: 'pm_fake_1',
        options: { idempotencyKey: 'key_detach' },
      },
    ]);
  });

  it('rejects detaching a PaymentMethod that is not attached, as Stripe does', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: null });

    await expect(
      stripe.paymentMethods.detach('pm_fake_1'),
    ).rejects.toMatchObject({
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      statusCode: 400,
      message:
        'The payment method you provided is not attached to a customer so detachment is impossible.',
    });
  });

  it('bends an attach response through the attach override without changing the stored PaymentMethod', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: null });
    stripe.setPaymentMethodAttachOverride((paymentMethod) => ({
      ...paymentMethod,
      customer: 'cus_other',
    }));

    await expect(
      stripe.paymentMethods.attach('pm_fake_1', { customer: 'cus_one' }),
    ).resolves.toEqual({ id: 'pm_fake_1', customer: 'cus_other' });
    await expect(stripe.paymentMethods.retrieve('pm_fake_1')).resolves.toEqual({
      id: 'pm_fake_1',
      customer: 'cus_one',
    });
  });

  it('refuses to attach a detached PaymentMethod again, as Stripe does', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: 'cus_one' });
    await stripe.paymentMethods.detach('pm_fake_1');

    await expect(
      stripe.paymentMethods.attach('pm_fake_1', { customer: 'cus_one' }),
    ).rejects.toMatchObject({
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      statusCode: 400,
      message:
        'This PaymentMethod was previously used without being attached to a Customer or was detached from a Customer, and may not be used again.',
    });
    await expect(stripe.paymentMethods.retrieve('pm_fake_1')).resolves.toEqual({
      id: 'pm_fake_1',
      customer: null,
    });
  });

  it('fails a PaymentMethod lookup for an id it never seeded', async () => {
    const stripe = new FakeStripeCheckoutClient();

    await expect(stripe.paymentMethods.retrieve('pm_unknown')).rejects.toThrow(
      'Missing fake PaymentMethod: pm_unknown',
    );
  });

  it('fails a detached PaymentMethod attach the way an unbound SDK method would', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const attach = stripe.paymentMethods.attach;

    await expect(
      attach('pm_fake_1', { customer: 'cus_one' }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("sets a seeded Subscription's default PaymentMethod and records the update", async () => {
    const stripe = fakeWithActiveSubscription();
    stripe.seedPaymentMethod({ id: 'pm_fake_1', customer: 'cus_one' });

    await expect(
      stripe.subscriptions.update(
        'sub_fake_1',
        { default_payment_method: 'pm_fake_1' },
        { idempotencyKey: 'key_update' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'sub_fake_1',
        default_payment_method: 'pm_fake_1',
      }),
    );
    await expect(stripe.subscriptions.retrieve('sub_fake_1')).resolves.toEqual(
      expect.objectContaining({ default_payment_method: 'pm_fake_1' }),
    );
    expect(stripe.subscriptions.updateCalls).toEqual([
      {
        subscriptionId: 'sub_fake_1',
        params: { default_payment_method: 'pm_fake_1' },
        options: { idempotencyKey: 'key_update' },
      },
    ]);
  });

  it.each([
    ['unattached', null],
    ['attached to another customer', 'cus_two'],
  ] as const)(
    'refuses a Subscription default PaymentMethod that is %s, as Stripe does',
    async (_case, customer) => {
      const stripe = fakeWithActiveSubscription();
      stripe.seedPaymentMethod({ id: 'pm_fake_1', customer });

      await expect(
        stripe.subscriptions.update('sub_fake_1', {
          default_payment_method: 'pm_fake_1',
        }),
      ).rejects.toMatchObject({
        type: 'StripeInvalidRequestError',
        rawType: 'invalid_request_error',
        statusCode: 400,
        param: 'payment_method',
        message:
          'The customer does not have a payment method with the ID pm_fake_1. The payment method must be attached to the customer.',
      });
      await expect(
        stripe.subscriptions.retrieve('sub_fake_1'),
      ).resolves.not.toHaveProperty('default_payment_method');
    },
  );

  it('fails an update for a Subscription it never seeded', async () => {
    const stripe = new FakeStripeCheckoutClient();

    await expect(
      stripe.subscriptions.update('sub_unknown', {
        default_payment_method: 'pm_fake_1',
      }),
    ).rejects.toThrow('Missing fake Subscription: sub_unknown');
  });
});
