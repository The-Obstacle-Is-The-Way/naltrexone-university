import 'server-only';
import Stripe from 'stripe';
import { env } from './env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  /**
   * Pinned Stripe API version to keep webhook event shapes stable and prevent
   * silent behavior changes across environments.
   *
   * Update only after:
   * - Reviewing Stripe's API version changelog for breaking changes
   * - Verifying webhooks + checkout flows in a staging environment
   *
   * Reference: https://stripe.com/docs/upgrades#api-versions
   * Last reviewed: 2026-01-28
   */
  apiVersion: '2026-01-28.clover',
  typescript: true,
});
