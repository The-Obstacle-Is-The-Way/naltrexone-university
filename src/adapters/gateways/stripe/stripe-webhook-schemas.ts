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

const stripeExpandableIdSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).passthrough(),
]);

export const stripeTrialPaymentMethodSetupSessionSchema = z
  .object({
    id: z.string().min(1),
    mode: z.literal('setup'),
    setup_intent: stripeExpandableIdSchema,
    consent: z.object({
      terms_of_service: z.literal('accepted'),
    }),
    metadata: z
      .object({
        consent_user_id: z.string().min(1),
        consent_customer_id: z.string().min(1),
        consent_subscription_id: z.string().min(1),
        consent_plan: z.enum(['monthly', 'annual']),
        consent_amount_cents: z.string().regex(/^[1-9]\d*$/),
        consent_currency: z.literal('usd'),
        consent_frequency: z.enum(['month', 'year']),
        consent_trial_ends_at: z.iso.datetime({ offset: true }),
        consent_disclosure_version: z.string().min(1),
        consent_terms_version: z.string().min(1),
        consent_terms_hash: z.string().min(1),
        consent_state_signature: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .passthrough();

export const stripeSetupIntentSchema = z
  .object({
    id: z.string().min(1),
    payment_method: stripeExpandableIdSchema,
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
