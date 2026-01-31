import 'server-only';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { stripeSubscriptions } from '@/db/schema';
import { db } from './db';

/**
 * Active subscription statuses per spec.
 * A user is entitled if status ∈ { "active", "trialing" } AND current_period_end > now()
 */
const ENTITLED_STATUSES = ['active', 'trialing'] as const;

/**
 * Check if a user has an active subscription entitlement.
 */
export async function isUserEntitled(userId: string): Promise<boolean> {
  const subscription = await db.query.stripeSubscriptions.findFirst({
    where: and(
      eq(stripeSubscriptions.userId, userId),
      inArray(stripeSubscriptions.status, [...ENTITLED_STATUSES]),
      gt(stripeSubscriptions.currentPeriodEnd, new Date()),
    ),
  });

  return !!subscription;
}

/**
 * Get the user's subscription, if any.
 */
export async function getUserSubscription(userId: string) {
  return db.query.stripeSubscriptions.findFirst({
    where: eq(stripeSubscriptions.userId, userId),
  });
}

/**
 * Throw an error if the user is not entitled.
 */
export async function requireSubscriptionOrThrow(userId: string) {
  const entitled = await isUserEntitled(userId);
  if (!entitled) {
    throw new Error('UNSUBSCRIBED');
  }
}
