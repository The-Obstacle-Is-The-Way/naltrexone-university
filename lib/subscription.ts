import 'server-only';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { stripeSubscriptions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { EntitledStatuses } from '@/src/domain/value-objects';
import { db } from './db';

/**
 * Check if a user has an active subscription entitlement.
 */
export async function isUserEntitled(userId: string): Promise<boolean> {
  const subscription = await db.query.stripeSubscriptions.findFirst({
    where: and(
      eq(stripeSubscriptions.userId, userId),
      inArray(stripeSubscriptions.status, [...EntitledStatuses]),
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
    throw new ApplicationError(
      'UNSUBSCRIBED',
      'Subscription is required to access this resource',
    );
  }
}
