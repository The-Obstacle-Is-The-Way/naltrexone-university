import type { SubscriptionPlan, SubscriptionStatus } from '../value-objects';

/**
 * Subscription entity - user's payment status.
 *
 * IMPORTANT: No vendor IDs live in the domain layer.
 * Stripe subscription IDs and price IDs belong in the persistence layer only.
 */
export type Subscription = {
  readonly id: string;
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
