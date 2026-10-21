import type {
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';

export type StripeRequestClient = StripeClient & {
  customers: StripeClient['customers'] & {
    del(customerId: string): Promise<unknown>;
  };
};

async function withOptions<T>(
  options: StripeRequestOptions | undefined,
  call: () => Promise<T>,
): Promise<T> {
  if (
    options?.maxNetworkRetries !== undefined &&
    options.maxNetworkRetries !== 0
  ) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Budgeted Stripe calls cannot override SDK retries',
    );
  }
  return call();
}

/** Expose the app's finite client surface without reopening the SDK retry scheduler. */
export function stripeRequestClient(
  client: StripeRequestClient,
): StripeRequestClient {
  return {
    customers: {
      create: (params, options) =>
        withOptions(options, () => client.customers.create(params, options)),
      search: (params, options) =>
        withOptions(options, () => client.customers.search(params, options)),
      retrieve: (id) => client.customers.retrieve(id),
      del: (id) => client.customers.del(id),
    },
    checkout: {
      sessions: {
        create: (params, options) =>
          withOptions(options, () =>
            client.checkout.sessions.create(params, options),
          ),
        list: (params) => client.checkout.sessions.list(params),
        retrieve: (id, params) => client.checkout.sessions.retrieve(id, params),
        expire: (id, params, options) =>
          withOptions(options, () =>
            client.checkout.sessions.expire(id, params, options),
          ),
      },
    },
    subscriptions: {
      retrieve: (id, params, options) =>
        withOptions(options, () =>
          client.subscriptions.retrieve(id, params, options),
        ),
      list: (params, options) =>
        withOptions(options, () => client.subscriptions.list(params, options)),
      cancel: (id, params, options) =>
        withOptions(options, () =>
          client.subscriptions.cancel(id, params, options),
        ),
      update: (id, params, options) =>
        withOptions(options, () =>
          client.subscriptions.update(id, params, options),
        ),
    },
    paymentMethods: {
      retrieve: (id) => client.paymentMethods.retrieve(id),
      attach: (id, params, options) =>
        withOptions(options, () =>
          client.paymentMethods.attach(id, params, options),
        ),
      detach: (id, params, options) =>
        withOptions(options, () =>
          client.paymentMethods.detach(id, params, options),
        ),
    },
    setupIntents: {
      retrieve: (id, params) => client.setupIntents.retrieve(id, params),
    },
    billingPortal: {
      sessions: {
        create: (params, options) =>
          withOptions(options, () =>
            client.billingPortal.sessions.create(params, options),
          ),
      },
      configurations: {
        create: (params, options) =>
          withOptions(options, () =>
            client.billingPortal.configurations.create(params, options),
          ),
        list: (params) => client.billingPortal.configurations.list(params),
      },
    },
    webhooks: {
      constructEvent: (body, signature, secret) =>
        client.webhooks.constructEvent(body, signature, secret),
    },
  };
}
