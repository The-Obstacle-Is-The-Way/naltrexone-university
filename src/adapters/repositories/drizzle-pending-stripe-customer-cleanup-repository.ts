import { and, asc, eq, lt, notInArray } from 'drizzle-orm';
import { pendingStripeCancellations } from '@/db/schema';
import type {
  PendingStripeCustomerCleanup,
  PendingStripeCustomerCleanupRepository,
} from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

/**
 * Persists customer-cleanup obligations in the legacy physical table
 * `pending_stripe_cancellations`; renaming that table is intentionally deferred.
 */
export class DrizzlePendingStripeCustomerCleanupRepository
  implements PendingStripeCustomerCleanupRepository
{
  constructor(private readonly db: DrizzleDb) {}

  async findByEventId(
    eventId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const [row] = await this.db
      .select({
        stripeCustomerId: pendingStripeCancellations.stripeCustomerId,
      })
      .from(pendingStripeCancellations)
      .where(eq(pendingStripeCancellations.eventId, eventId))
      .limit(1);

    if (!row) return null;
    return { stripeCustomerId: row.stripeCustomerId };
  }

  async schedule(eventId: string, stripeCustomerId: string): Promise<void> {
    await this.db
      .insert(pendingStripeCancellations)
      .values({ eventId, stripeCustomerId })
      .onConflictDoUpdate({
        target: pendingStripeCancellations.eventId,
        set: { stripeCustomerId },
      });
  }

  async deleteByEventId(eventId: string): Promise<void> {
    await this.db
      .delete(pendingStripeCancellations)
      .where(eq(pendingStripeCancellations.eventId, eventId));
  }

  async listStale(
    olderThan: Date,
    limit: number,
    excludeEventIds: readonly string[] = [],
  ): Promise<PendingStripeCustomerCleanup[]> {
    const staleBeforeCutoff = lt(
      pendingStripeCancellations.createdAt,
      olderThan,
    );
    return this.db
      .select({
        eventId: pendingStripeCancellations.eventId,
        stripeCustomerId: pendingStripeCancellations.stripeCustomerId,
        createdAt: pendingStripeCancellations.createdAt,
      })
      .from(pendingStripeCancellations)
      .where(
        excludeEventIds.length > 0
          ? and(
              staleBeforeCutoff,
              notInArray(pendingStripeCancellations.eventId, [
                ...excludeEventIds,
              ]),
            )
          : staleBeforeCutoff,
      )
      .orderBy(asc(pendingStripeCancellations.createdAt))
      .limit(limit);
  }
}
