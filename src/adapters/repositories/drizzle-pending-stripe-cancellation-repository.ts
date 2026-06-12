import { asc, eq, lt } from 'drizzle-orm';
import { pendingStripeCancellations } from '@/db/schema';
import type {
  PendingStripeCancellation,
  PendingStripeCancellationRepository,
} from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzlePendingStripeCancellationRepository
  implements PendingStripeCancellationRepository
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

  async listStale(olderThan: Date): Promise<PendingStripeCancellation[]> {
    return this.db
      .select({
        eventId: pendingStripeCancellations.eventId,
        stripeCustomerId: pendingStripeCancellations.stripeCustomerId,
        createdAt: pendingStripeCancellations.createdAt,
      })
      .from(pendingStripeCancellations)
      .where(lt(pendingStripeCancellations.createdAt, olderThan))
      .orderBy(asc(pendingStripeCancellations.createdAt));
  }
}
