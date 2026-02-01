import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { stripeEvents } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { StripeEventRepository } from '@/src/application/ports/repositories';

type Db = PostgresJsDatabase<typeof schema>;

export class DrizzleStripeEventRepository implements StripeEventRepository {
  constructor(private readonly db: Db) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const row = await this.db.query.stripeEvents.findFirst({
      where: eq(stripeEvents.id, eventId),
    });

    if (!row) return false;
    return row.processedAt !== null && row.error === null;
  }

  async ensure(eventId: string, type: string): Promise<void> {
    await this.db
      .insert(stripeEvents)
      .values({ id: eventId, type, processedAt: null, error: null })
      .onConflictDoNothing({ target: stripeEvents.id });
  }

  async markProcessed(eventId: string): Promise<void> {
    const [updated] = await this.db
      .update(stripeEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(stripeEvents.id, eventId))
      .returning();

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const [updated] = await this.db
      .update(stripeEvents)
      .set({ processedAt: null, error })
      .where(eq(stripeEvents.id, eventId))
      .returning();

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
  }
}
