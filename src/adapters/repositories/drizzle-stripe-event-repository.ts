import { eq } from 'drizzle-orm';
import { stripeEvents } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { StripeEventRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleStripeEventRepository implements StripeEventRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async claim(eventId: string, type: string): Promise<boolean> {
    const [row] = await this.db
      .insert(stripeEvents)
      .values({ id: eventId, type, processedAt: null, error: null })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });

    return !!row;
  }

  async lock(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null }> {
    const [row] = await this.db
      .select({
        processedAt: stripeEvents.processedAt,
        error: stripeEvents.error,
      })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, eventId))
      .for('update');

    if (!row) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }

    return { processedAt: row.processedAt ?? null, error: row.error ?? null };
  }

  async markProcessed(eventId: string): Promise<void> {
    const [updated] = await this.db
      .update(stripeEvents)
      .set({ processedAt: this.now(), error: null })
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
