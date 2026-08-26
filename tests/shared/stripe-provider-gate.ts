export type StripeProviderGateErrorCode =
  | 'PROVIDER_KEY_INVALID'
  | 'PROVIDER_PRICE_INVALID';

type StripeProviderEnvironment = Readonly<Record<string, string | undefined>>;

type StripeProviderGateOptions = {
  flag: string;
  priceKeys: readonly string[];
};

export type StripeProviderGateResult =
  | { mode: 'skip'; reason: string }
  | {
      mode: 'run';
      stripePriceId: string;
      stripeSecretKey: string;
    };

export class StripeProviderGateError extends Error {
  readonly code: StripeProviderGateErrorCode;

  constructor(code: StripeProviderGateErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'StripeProviderGateError';
    this.code = code;
  }
}

export function isUsableStripeTestKey(
  value: string | undefined,
): value is string {
  return Boolean(value?.startsWith('sk_test_') && !value.includes('dummy'));
}

function isUsableStripePriceId(value: string | undefined): value is string {
  return Boolean(value?.startsWith('price_') && !value.includes('dummy'));
}

function firstConfiguredValue(
  env: StripeProviderEnvironment,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    if (env[key] !== undefined) return env[key];
  }
  return undefined;
}

export function resolveStripeProviderGate(
  env: StripeProviderEnvironment,
  options: StripeProviderGateOptions,
): StripeProviderGateResult {
  if (env[options.flag] !== 'true') {
    return {
      mode: 'skip',
      reason: `set ${options.flag}=true to run the Stripe provider contract`,
    };
  }

  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  if (!isUsableStripeTestKey(stripeSecretKey)) {
    throw new StripeProviderGateError(
      'PROVIDER_KEY_INVALID',
      'STRIPE_SECRET_KEY must be a non-dummy Stripe test secret key',
    );
  }

  const stripePriceId = firstConfiguredValue(env, options.priceKeys);
  if (!isUsableStripePriceId(stripePriceId)) {
    throw new StripeProviderGateError(
      'PROVIDER_PRICE_INVALID',
      `provide a non-dummy Stripe Price through ${options.priceKeys.join(' or ')}`,
    );
  }

  return {
    mode: 'run',
    stripePriceId,
    stripeSecretKey,
  };
}
