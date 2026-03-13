import { eq } from 'drizzle-orm';
import { deletedClerkUsers } from '@/db/schema';
import type { DeletedClerkUserRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleDeletedClerkUserRepository
  implements DeletedClerkUserRepository
{
  constructor(private readonly db: DrizzleDb) {}

  async exists(clerkUserId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ clerkUserId: deletedClerkUsers.clerkUserId })
      .from(deletedClerkUsers)
      .where(eq(deletedClerkUsers.clerkUserId, clerkUserId))
      .limit(1);

    return !!row;
  }

  async markDeleted(
    clerkUserId: string,
    deletedAt = new Date(),
  ): Promise<void> {
    await this.db
      .insert(deletedClerkUsers)
      .values({ clerkUserId, deletedAt })
      .onConflictDoNothing({ target: deletedClerkUsers.clerkUserId });
  }
}
