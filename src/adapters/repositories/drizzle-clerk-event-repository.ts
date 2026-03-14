import { eq } from 'drizzle-orm';
import { clerkEvents } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { ClerkEventRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleClerkEventRepository implements ClerkEventRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async claim(eventId: string, type: string): Promise<boolean> {
    const [row] = await this.db
      .insert(clerkEvents)
      .values({ id: eventId, type, processedAt: null, error: null })
      .onConflictDoNothing({ target: clerkEvents.id })
      .returning({ id: clerkEvents.id });

    return !!row;
  }

  async peek(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null } | null> {
    const [row] = await this.db
      .select({
        processedAt: clerkEvents.processedAt,
        error: clerkEvents.error,
      })
      .from(clerkEvents)
      .where(eq(clerkEvents.id, eventId))
      .limit(1);

    if (!row) return null;

    return { processedAt: row.processedAt ?? null, error: row.error ?? null };
  }

  async lock(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null }> {
    const [row] = await this.db
      .select({
        processedAt: clerkEvents.processedAt,
        error: clerkEvents.error,
      })
      .from(clerkEvents)
      .where(eq(clerkEvents.id, eventId))
      .for('update');

    if (!row) {
      throw new ApplicationError('NOT_FOUND', 'Clerk event not found');
    }

    return { processedAt: row.processedAt ?? null, error: row.error ?? null };
  }

  async markProcessed(eventId: string): Promise<void> {
    const [updated] = await this.db
      .update(clerkEvents)
      .set({ processedAt: this.now(), error: null })
      .where(eq(clerkEvents.id, eventId))
      .returning();

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Clerk event not found');
    }
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const [updated] = await this.db
      .update(clerkEvents)
      .set({ processedAt: null, error })
      .where(eq(clerkEvents.id, eventId))
      .returning();

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Clerk event not found');
    }
  }
}
