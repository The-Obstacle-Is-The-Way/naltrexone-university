import { z } from 'zod';

export const stripeSubscriptionItemSchema = z
  .object({
    current_period_end: z.number(),
    price: z.object({
      id: z.string(),
    }),
  })
  .passthrough();

export const stripeSubscriptionSchema = z
  .object({
    id: z.string(),
    customer: z.string(),
    status: z.string(),
    cancel_at_period_end: z.boolean(),
    metadata: z.record(z.string()).optional(),
    items: z.object({
      data: z.array(stripeSubscriptionItemSchema).min(1),
    }),
  })
  .passthrough();

export const stripeCheckoutSessionSchema = z
  .object({
    subscription: z
      .union([z.string(), z.object({ id: z.string() }).passthrough()])
      .nullable()
      .optional(),
  })
  .passthrough();

export const stripeEventWithSubscriptionRefSchema = stripeCheckoutSessionSchema;

export type StripeEventWithSubscriptionRef = z.infer<
  typeof stripeCheckoutSessionSchema
>;

export type StripeSubscriptionRef = Exclude<
  StripeEventWithSubscriptionRef['subscription'],
  null | undefined
>;

export const subscriptionEventTypes = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
]);
