import { describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import {
  createStripeTestClient,
  STRIPE_TEST_MAX_NETWORK_RETRIES,
  STRIPE_TEST_REQUEST_TIMEOUT_MS,
} from './stripe-test-client';

describe('createStripeTestClient', () => {
  it('pins every E2E Stripe request to a bounded test-mode client', () => {
    const stripe = createStripeTestClient('sk_test_bounded');

    expect(stripe.getApiField('version')).toBe(STRIPE_API_VERSION);
    expect(stripe.getApiField('timeout')).toBe(STRIPE_TEST_REQUEST_TIMEOUT_MS);
    expect(stripe.getApiField('maxNetworkRetries')).toBe(
      STRIPE_TEST_MAX_NETWORK_RETRIES,
    );
  });

  it.each(['sk_live_forbidden', ''])(
    'rejects a non-test or placeholder key before making a request',
    (secretKey) => {
      expect(() => createStripeTestClient(secretKey)).toThrow(
        '[E2E_STRIPE_CLIENT:TEST_MODE_REQUIRED]',
      );
    },
  );

  it('allows the existing dummy key for mocked unit-test clients', () => {
    expect(() => createStripeTestClient('sk_test_dummy')).not.toThrow();
  });
});
