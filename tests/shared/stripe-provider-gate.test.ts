import { describe, expect, it } from 'vitest';
import {
  isUsableStripeTestKey,
  resolveStripeProviderGate,
  StripeProviderGateError,
} from './stripe-provider-gate';

const FLAG = 'RUN_STRIPE_PROVIDER_CONTRACT';
const PRICE_KEYS = [
  'STRIPE_PROVIDER_PRICE_ID',
  'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
] as const;

function environment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return {
    [FLAG]: 'true',
    STRIPE_SECRET_KEY: 'sk_test_contract_key',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_contract_monthly',
    ...overrides,
  };
}

describe('resolveStripeProviderGate', () => {
  it('returns skip when the provider flag is not exactly true', () => {
    expect(
      resolveStripeProviderGate(environment({ [FLAG]: undefined }), {
        flag: FLAG,
        priceKeys: PRICE_KEYS,
      }),
    ).toEqual({
      mode: 'skip',
      reason: `set ${FLAG}=true to run the Stripe provider contract`,
    });
  });

  it.each([
    ['missing', undefined],
    ['live-mode', 'sk_live_contract_key'],
    ['dummy', 'sk_test_dummy'],
    ['prefix-only', 'sk_test_'],
  ])('throws PROVIDER_KEY_INVALID when the key is %s', (_label, value) => {
    expect(() =>
      resolveStripeProviderGate(environment({ STRIPE_SECRET_KEY: value }), {
        flag: FLAG,
        priceKeys: PRICE_KEYS,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'StripeProviderGateError',
        code: 'PROVIDER_KEY_INVALID',
      }),
    );
  });

  it.each([
    ['missing', undefined],
    ['wrong shape', 'product_contract_monthly'],
    ['dummy', 'price_dummy_monthly'],
    ['prefix-only', 'price_'],
  ])('throws PROVIDER_PRICE_INVALID when the price is %s', (_label, value) => {
    expect(() =>
      resolveStripeProviderGate(
        environment({
          STRIPE_PROVIDER_PRICE_ID: undefined,
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: value,
        }),
        { flag: FLAG, priceKeys: PRICE_KEYS },
      ),
    ).toThrowError(
      expect.objectContaining({
        name: 'StripeProviderGateError',
        code: 'PROVIDER_PRICE_INVALID',
      }),
    );
  });

  it('rejects an invalid first configured price instead of hiding it behind a valid fallback', () => {
    expect(() =>
      resolveStripeProviderGate(
        environment({ STRIPE_PROVIDER_PRICE_ID: 'price_dummy_override' }),
        { flag: FLAG, priceKeys: PRICE_KEYS },
      ),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_PRICE_INVALID' }));
  });

  it('returns the validated provider inputs when every prerequisite is usable', () => {
    expect(
      resolveStripeProviderGate(environment(), {
        flag: FLAG,
        priceKeys: PRICE_KEYS,
      }),
    ).toEqual({
      mode: 'run',
      stripePriceId: 'price_contract_monthly',
      stripeSecretKey: 'sk_test_contract_key',
    });
  });

  it('never includes credential or price values in a gate failure', () => {
    const invalidKey = 'sk_live_do_not_print_this_value';
    const priceId = 'price_do_not_print_this_value';
    let failure: unknown;

    try {
      resolveStripeProviderGate(
        environment({
          STRIPE_SECRET_KEY: invalidKey,
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: priceId,
        }),
        { flag: FLAG, priceKeys: PRICE_KEYS },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(StripeProviderGateError);
    expect((failure as Error).message).not.toContain(invalidKey);
    expect((failure as Error).message).not.toContain(priceId);
  });
});

describe('isUsableStripeTestKey', () => {
  it('accepts only non-dummy Stripe test secret keys', () => {
    expect(isUsableStripeTestKey('sk_test_contract_key')).toBe(true);
    expect(isUsableStripeTestKey('sk_test_dummy')).toBe(false);
    expect(isUsableStripeTestKey('sk_live_contract_key')).toBe(false);
    expect(isUsableStripeTestKey(undefined)).toBe(false);
  });
});
