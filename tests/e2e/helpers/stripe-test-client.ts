import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';

export const STRIPE_TEST_REQUEST_TIMEOUT_MS = 15_000;
export const STRIPE_TEST_MAX_NETWORK_RETRIES = 1;

export function createStripeTestClient(secretKey?: string): Stripe {
  const resolvedSecretKey = secretKey ?? process.env.STRIPE_SECRET_KEY?.trim();
  if (!resolvedSecretKey?.startsWith('sk_test_')) {
    throw new Error(
      '[E2E_STRIPE_CLIENT:TEST_MODE_REQUIRED] A real Stripe test-mode key is required.',
    );
  }

  return new Stripe(resolvedSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: STRIPE_TEST_MAX_NETWORK_RETRIES,
    timeout: STRIPE_TEST_REQUEST_TIMEOUT_MS,
    typescript: true,
  });
}
