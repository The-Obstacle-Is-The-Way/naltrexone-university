import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { UserRepository } from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import { isPostgresUniqueViolation } from './postgres-errors';

export class DrizzleUserRepository implements UserRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toDomain(row: {
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapDbError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) return error;

    if (isPostgresUniqueViolation(error)) {
      return new ApplicationError(
        'CONFLICT',
        'User could not be upserted due to a uniqueness constraint',
      );
    }

    return new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkId),
    });

    return row ? this.toDomain(row) : null;
  }

  async upsertByClerkId(clerkId: string, email: string): Promise<User> {
    // Try to find existing user
    const existing = await this.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkId),
    });

    if (existing) {
      // If email matches, return as-is
      if (existing.email === email) {
        return this.toDomain(existing);
      }

      // Email changed, update it
      try {
        const [updated] = await this.db
          .update(users)
          .set({ email, updatedAt: this.now() })
          .where(eq(users.clerkUserId, clerkId))
          .returning();

        return this.toDomain(updated ?? existing);
      } catch (error) {
        throw this.mapDbError(error);
      }
    }

    // Try to insert new user
    let inserted:
      | { id: string; email: string; createdAt: Date; updatedAt: Date }
      | undefined;

    try {
      [inserted] = await this.db
        .insert(users)
        .values({ clerkUserId: clerkId, email })
        .onConflictDoNothing({ target: users.clerkUserId })
        .returning();
    } catch (error) {
      throw this.mapDbError(error);
    }

    if (inserted) {
      return this.toDomain(inserted);
    }

    // Race condition: another request inserted the row
    const after = await this.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkId),
    });

    if (!after) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
    }

    // Check if email needs updating
    if (after.email === email) {
      return this.toDomain(after);
    }

    // Update email after race condition
    try {
      const [updated] = await this.db
        .update(users)
        .set({ email, updatedAt: this.now() })
        .where(eq(users.clerkUserId, clerkId))
        .returning();

      return this.toDomain(updated ?? after);
    } catch (error) {
      throw this.mapDbError(error);
    }
  }
}
