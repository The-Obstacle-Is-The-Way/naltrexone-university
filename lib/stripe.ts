import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

let stripeInstance: Stripe | null = null;

const STRIPE_API_VERSION = '2026-04-22.dahlia';

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
     * Last reviewed: 2026-05-24
     */
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });

  return stripeInstance;
}
