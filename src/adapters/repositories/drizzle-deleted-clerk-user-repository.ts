import { eq, sql } from 'drizzle-orm';
import { deletedClerkUsers } from '@/db/schema';
import type { DeletedClerkUserRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleDeletedClerkUserRepository
  implements DeletedClerkUserRepository
{
  constructor(private readonly db: DrizzleDb) {}

  async lock(clerkUserId: string): Promise<void> {
    // Transaction precondition: this xact lock protects later statements only
    // when the repository was constructed from the surrounding callback tx.
    // Its hashtextextended Clerk-tombstone domain is intentionally distinct.
    await this.db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${clerkUserId}, 0))`,
    );
  }

  async exists(clerkUserId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ clerkUserId: deletedClerkUsers.clerkUserId })
      .from(deletedClerkUsers)
      .where(eq(deletedClerkUsers.clerkUserId, clerkUserId))
      .limit(1);

    return !!row;
  }

  async markDeleted(clerkUserId: string, deletedAt?: Date): Promise<void> {
    await this.db
      .insert(deletedClerkUsers)
      .values(deletedAt ? { clerkUserId, deletedAt } : { clerkUserId })
      .onConflictDoNothing({ target: deletedClerkUsers.clerkUserId });
  }
}
