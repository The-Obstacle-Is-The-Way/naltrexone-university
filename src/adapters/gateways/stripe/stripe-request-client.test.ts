import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import type {
  BillingPortalConfigurationCreateParams,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import {
  type StripeRequestClient,
  stripeRequestClient,
} from './stripe-request-client';

// DEBT-527: proven through the real SDK, so a wrapper method that loses its
// receiver fails here. The HTTP client records each request and never reaches
// the network.
function createRecordedClient() {
  const requests: Array<{
    method: string;
    path: string;
    idempotencyKey: string | null;
  }> = [];
  const stripe = new Stripe('sk_test_loopback_only', {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async (url, init) => {
      requests.push({
        method: init?.method ?? 'GET',
        path: new URL(String(url)).pathname,
        idempotencyKey: new Headers(init?.headers).get('Idempotency-Key'),
      });
      return new Response(JSON.stringify({ id: 'obj_recorded' }), {
        status: 200,
      });
    }),
  });
  return { stripe, client: stripeRequestClient(stripe), requests };
}

const PORTAL_CONFIGURATION: BillingPortalConfigurationCreateParams = {
  features: {
    customer_update: { enabled: false, allowed_updates: [] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      proration_behavior: 'none',
      cancellation_reason: { enabled: false, options: [] },
    },
    subscription_update: { enabled: false },
  },
  metadata: {},
};

type OptionedCall = (
  client: StripeRequestClient,
  options?: StripeRequestOptions,
) => Promise<unknown>;
type PlainCall = (client: StripeRequestClient) => Promise<unknown>;

const OPTIONED_CALLS: Array<[string, string, string, OptionedCall]> = [
  [
    'customers.create',
    'POST',
    '/v1/customers',
    (client, options) =>
      client.customers.create({ email: 'learner@example.test' }, options),
  ],
  [
    'customers.search',
    'GET',
    '/v1/customers/search',
    (client, options) =>
      client.customers.search(
        { query: "email:'learner@example.test'" },
        options,
      ),
  ],
  [
    'checkout.sessions.create',
    'POST',
    '/v1/checkout/sessions',
    (client, options) =>
      client.checkout.sessions.create(
        {
          mode: 'setup',
          currency: 'usd',
          success_url: 'https://example.test/success',
          cancel_url: 'https://example.test/cancel',
        },
        options,
      ),
  ],
  [
    'checkout.sessions.expire',
    'POST',
    '/v1/checkout/sessions/cs_test/expire',
    (client, options) =>
      client.checkout.sessions.expire('cs_test', undefined, options),
  ],
  [
    'subscriptions.retrieve',
    'GET',
    '/v1/subscriptions/sub_test',
    (client, options) =>
      client.subscriptions.retrieve('sub_test', undefined, options),
  ],
  [
    'subscriptions.list',
    'GET',
    '/v1/subscriptions',
    (client, options) =>
      client.subscriptions.list({ customer: 'cus_test' }, options),
  ],
  [
    'subscriptions.cancel',
    'DELETE',
    '/v1/subscriptions/sub_test',
    (client, options) =>
      client.subscriptions.cancel('sub_test', undefined, options),
  ],
  [
    'subscriptions.update',
    'POST',
    '/v1/subscriptions/sub_test',
    (client, options) =>
      client.subscriptions.update(
        'sub_test',
        { default_payment_method: 'pm_test' },
        options,
      ),
  ],
  [
    'paymentMethods.attach',
    'POST',
    '/v1/payment_methods/pm_test/attach',
    (client, options) =>
      client.paymentMethods.attach(
        'pm_test',
        { customer: 'cus_test' },
        options,
      ),
  ],
  [
    'paymentMethods.detach',
    'POST',
    '/v1/payment_methods/pm_test/detach',
    (client, options) =>
      client.paymentMethods.detach('pm_test', undefined, options),
  ],
  [
    'billingPortal.sessions.create',
    'POST',
    '/v1/billing_portal/sessions',
    (client, options) =>
      client.billingPortal.sessions.create(
        { customer: 'cus_test', return_url: 'https://example.test/billing' },
        options,
      ),
  ],
  [
    'billingPortal.configurations.create',
    'POST',
    '/v1/billing_portal/configurations',
    (client, options) =>
      client.billingPortal.configurations.create(PORTAL_CONFIGURATION, options),
  ],
];

const PLAIN_CALLS: Array<[string, string, string, PlainCall]> = [
  [
    'customers.retrieve',
    'GET',
    '/v1/customers/cus_test',
    (client) => client.customers.retrieve('cus_test'),
  ],
  [
    'customers.del',
    'DELETE',
    '/v1/customers/cus_test',
    (client) => client.customers.del('cus_test'),
  ],
  [
    'checkout.sessions.list',
    'GET',
    '/v1/checkout/sessions',
    (client) =>
      client.checkout.sessions.list({ customer: 'cus_test', limit: 1 }),
  ],
  [
    'checkout.sessions.retrieve',
    'GET',
    '/v1/checkout/sessions/cs_test',
    (client) =>
      client.checkout.sessions.retrieve('cs_test', { expand: ['line_items'] }),
  ],
  [
    'paymentMethods.retrieve',
    'GET',
    '/v1/payment_methods/pm_test',
    (client) => client.paymentMethods.retrieve('pm_test'),
  ],
  [
    'setupIntents.retrieve',
    'GET',
    '/v1/setup_intents/seti_test',
    (client) =>
      client.setupIntents.retrieve('seti_test', { expand: ['payment_method'] }),
  ],
  [
    'billingPortal.configurations.list',
    'GET',
    '/v1/billing_portal/configurations',
    (client) =>
      client.billingPortal.configurations.list({ active: true, limit: 1 }),
  ],
];

describe('stripeRequestClient', () => {
  it.each([...OPTIONED_CALLS, ...PLAIN_CALLS])(
    'sends %s through the SDK as %s %s',
    async (_name, method, path, call) => {
      const { client, requests } = createRecordedClient();

      await expect(call(client)).resolves.toMatchObject({
        id: 'obj_recorded',
      });

      expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
        { method, path },
      ]);
    },
  );

  it.each(OPTIONED_CALLS)(
    'refuses a per-call retry override on %s before calling Stripe',
    async (_name, _method, _path, call) => {
      const { client, requests } = createRecordedClient();

      const result = call(client, { maxNetworkRetries: 1 });

      await expect(result).rejects.toBeInstanceOf(ApplicationError);
      await expect(result).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Budgeted Stripe calls cannot override SDK retries',
      });
      expect(requests).toEqual([]);
    },
  );

  it('forwards an idempotency key with retries left off', async () => {
    const { client, requests } = createRecordedClient();

    await client.customers.create(
      { email: 'learner@example.test' },
      { idempotencyKey: 'debt527-key', maxNetworkRetries: 0 },
    );

    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/v1/customers',
        idempotencyKey: 'debt527-key',
      },
    ]);
  });

  it('verifies a webhook signature through the SDK', () => {
    const { stripe, client } = createRecordedClient();
    const secret = 'whsec_test_only';
    const payload = JSON.stringify({
      id: 'evt_test',
      object: 'event',
      type: 'customer.updated',
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    expect(
      client.webhooks.constructEvent(payload, signature, secret),
    ).toMatchObject({ id: 'evt_test', type: 'customer.updated' });
  });
});
