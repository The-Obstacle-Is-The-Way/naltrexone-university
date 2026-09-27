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
  // When service began and the instant renewals are counted from. Null only
  // for a row stored before these were recorded (DEBT-414 F02).
  readonly startedAt: Date | null;
  readonly billingCycleAnchor: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
