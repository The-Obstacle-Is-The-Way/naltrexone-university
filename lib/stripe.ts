import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
    /**
     * Pinned Stripe API version to keep webhook event shapes stable and prevent
     * silent behavior changes across environments.
     *
     * Update only after:
     * - Reviewing Stripe's API version changelog for breaking changes
     * - Verifying webhooks + checkout flows in a staging environment
     *
     * Reference: https://stripe.com/docs/upgrades#api-versions
     * Last reviewed: 2026-08-07
     */
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });

  return stripeInstance;
}
