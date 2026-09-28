import { isDeepStrictEqual } from 'node:util';
import type {
  BillingPortalConfigurationCreateParams,
  BillingPortalConfigurationListParams,
  StripeBillingPortalConfiguration,
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';

type PortalConfigurations = StripeClient['billingPortal']['configurations'];

type CreateCall = {
  params: BillingPortalConfigurationCreateParams;
  options?: StripeRequestOptions | undefined;
};

export type SeededPortalConfiguration = {
  active?: boolean;
  metadata?: Record<string, string>;
  paymentMethodUpdate?: boolean;
};

function clone(
  configuration: StripeBillingPortalConfiguration,
): StripeBillingPortalConfiguration {
  return structuredClone(configuration);
}

// Billing portal configurations as the adapter uses them (DEBT-414 F05): an
// idempotent create that saves its first response, and a cursor listing of
// the active ones. The shared Stripe contract proves both against TEST mode.
export class FakeStripePortalConfigurations implements PortalConfigurations {
  readonly createCalls: CreateCall[] = [];
  readonly listCalls: BillingPortalConfigurationListParams[] = [];
  private readonly configurations: StripeBillingPortalConfiguration[] = [];
  private readonly savedByIdempotencyKey = new Map<
    string,
    {
      params: BillingPortalConfigurationCreateParams;
      response: StripeBillingPortalConfiguration;
    }
  >();
  private sequence = 0;

  constructor(private readonly nowMs: () => number) {}

  seed(input: SeededPortalConfiguration = {}): string {
    return this.store({
      active: input.active ?? true,
      metadata: input.metadata ?? {},
      paymentMethodUpdate: input.paymentMethodUpdate ?? true,
      subscriptionUpdate: false,
    }).id;
  }

  // Models a Dashboard deactivation, an action outside the adapter. A saved
  // idempotent response still reports the configuration as it was created.
  deactivate(id: string): void {
    const configuration = this.configurations.find(
      (candidate) => candidate.id === id,
    );
    if (!configuration) throw new Error(`Unknown portal configuration: ${id}`);
    configuration.active = false;
  }

  create = async (
    params: BillingPortalConfigurationCreateParams,
    options?: StripeRequestOptions,
  ): Promise<StripeBillingPortalConfiguration> => {
    this.createCalls.push({
      params: structuredClone(params),
      ...(options ? { options: { ...options } } : {}),
    });
    const idempotencyKey = options?.idempotencyKey;
    const saved = idempotencyKey
      ? this.savedByIdempotencyKey.get(idempotencyKey)
      : undefined;
    if (saved) {
      if (!isDeepStrictEqual(saved.params, params)) {
        throw Object.assign(
          new Error(
            'Keys for idempotent requests can only be used with the same parameters they were first used with.',
          ),
          {
            type: 'StripeIdempotencyError',
            rawType: 'idempotency_error',
            statusCode: 400,
          },
        );
      }
      return clone(saved.response);
    }

    const configuration = this.store({
      active: true,
      metadata: params.metadata,
      paymentMethodUpdate: params.features.payment_method_update.enabled,
      subscriptionUpdate: params.features.subscription_update.enabled,
    });
    if (idempotencyKey) {
      this.savedByIdempotencyKey.set(idempotencyKey, {
        params: structuredClone(params),
        response: clone(configuration),
      });
    }
    return clone(configuration);
  };

  list = async (params: BillingPortalConfigurationListParams) => {
    this.listCalls.push({ ...params });
    const active = this.configurations
      .filter((configuration) => configuration.active === params.active)
      .reverse();
    const start = params.starting_after
      ? active.findIndex(({ id }) => id === params.starting_after) + 1
      : 0;
    const data = active.slice(start, start + params.limit).map(clone);
    return { data, has_more: start + params.limit < active.length };
  };

  private store(input: {
    active: boolean;
    metadata: Record<string, string>;
    paymentMethodUpdate: boolean;
    subscriptionUpdate: boolean;
  }): StripeBillingPortalConfiguration {
    this.sequence += 1;
    const configuration: StripeBillingPortalConfiguration = {
      id: `bpc_fake_${this.sequence}`,
      active: input.active,
      created: Math.floor(this.nowMs() / 1000),
      metadata: { ...input.metadata },
      features: {
        payment_method_update: { enabled: input.paymentMethodUpdate },
        subscription_update: { enabled: input.subscriptionUpdate },
      },
    };
    this.configurations.push(configuration);
    return configuration;
  }
}
