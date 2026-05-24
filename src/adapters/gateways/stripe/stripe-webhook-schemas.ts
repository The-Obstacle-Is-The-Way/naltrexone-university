import { z } from 'zod';

const stripeSubscriptionRefSchema = z.union([
  z.string(),
  z.object({ id: z.string() }).passthrough(),
]);

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
    metadata: z.record(z.string(), z.string()).optional(),
    items: z.object({
      data: z.array(stripeSubscriptionItemSchema).min(1),
    }),
  })
  .passthrough();

export const stripeCheckoutSessionSchema = z
  .object({
    subscription: stripeSubscriptionRefSchema.nullable().optional(),
  })
  .passthrough();

const stripeInvoiceSubscriptionRefSchema = z
  .object({
    parent: z
      .object({
        subscription_details: z
          .object({
            subscription: stripeSubscriptionRefSchema.nullable().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

// Clover invoice events moved the subscription ref under parent; keep root
// support for Checkout Session payloads and older compatible invoice shapes.
export const stripeEventWithSubscriptionRefSchema =
  stripeCheckoutSessionSchema.merge(stripeInvoiceSubscriptionRefSchema);

export type StripeEventWithSubscriptionRef = z.infer<
  typeof stripeEventWithSubscriptionRefSchema
>;

export type StripeSubscriptionRef = z.infer<typeof stripeSubscriptionRefSchema>;

export function extractSubscriptionRef(
  payload: StripeEventWithSubscriptionRef,
): StripeSubscriptionRef | null {
  return (
    payload.parent?.subscription_details?.subscription ??
    payload.subscription ??
    null
  );
}

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
