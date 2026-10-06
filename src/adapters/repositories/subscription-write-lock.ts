import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

type SubscriptionWriteLockDb = Pick<DrizzleDb, 'execute'>;

/**
 * Serialize all subscription writers for one local user.
 *
 * The Stripe webhook, checkout-success sync, and reconcile writers follow
 * advisory(user) -> stripe_subscriptions -> stripe_customers. User deletion
 * is the fourth writer: its cascade order is FK-fixed to stripe_customers ->
 * stripe_subscriptions, so it takes this same advisory lock before DELETE.
 * BUG-321's sync on a refused checkout is the fifth: it writes only through
 * the subscription upsert, advisory(user) -> stripe_subscriptions, a prefix of
 * that order.
 */
export async function acquireSubscriptionWriteLock(
  db: SubscriptionWriteLockDb,
  userId: string,
): Promise<void> {
  // Transaction precondition: callers must pass a callback transaction handle;
  // an autocommit call releases this xact lock before protected statements run.
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}
