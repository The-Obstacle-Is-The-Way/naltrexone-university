import 'server-only';
import type Stripe from 'stripe';
import { env } from '@/lib/env';
import { createStripeClient } from '@/lib/stripe-client';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  stripeInstance = createStripeClient(env.STRIPE_SECRET_KEY);
  return stripeInstance;
}
