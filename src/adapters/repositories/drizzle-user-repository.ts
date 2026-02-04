import { and, eq, lt } from 'drizzle-orm';
import { users } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  UpsertUserByClerkIdOptions,
  UserRepository,
} from '@/src/application/ports/repositories';
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

  private async bumpUpdatedAtIfStale(
    clerkId: string,
    observedAt: Date,
  ): Promise<User> {
    try {
      const [updated] = await this.db
        .update(users)
        .set({ updatedAt: observedAt })
        .where(
          and(eq(users.clerkUserId, clerkId), lt(users.updatedAt, observedAt)),
        )
        .returning();

      if (updated) {
        return this.toDomain(updated);
      }

      const latest = await this.db.query.users.findFirst({
        where: eq(users.clerkUserId, clerkId),
      });
      if (!latest) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Failed to ensure user row',
        );
      }
      return this.toDomain(latest);
    } catch (error) {
      throw this.mapDbError(error);
    }
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkId),
    });

    return row ? this.toDomain(row) : null;
  }

  async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User> {
    const observedAt = options?.observedAt ?? this.now();

    // Try to find existing user
    const existing = await this.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkId),
    });

    if (existing) {
      if (existing.updatedAt >= observedAt) {
        return this.toDomain(existing);
      }

      if (existing.email === email) {
        return options?.observedAt
          ? this.bumpUpdatedAtIfStale(clerkId, observedAt)
          : this.toDomain(existing);
      }

      // Email changed, update it
      try {
        const [updated] = await this.db
          .update(users)
          .set({ email, updatedAt: observedAt })
          .where(
            and(
              eq(users.clerkUserId, clerkId),
              lt(users.updatedAt, observedAt),
            ),
          )
          .returning();

        if (updated) {
          return this.toDomain(updated);
        }

        const after = await this.db.query.users.findFirst({
          where: eq(users.clerkUserId, clerkId),
        });
        if (!after) {
          throw new ApplicationError(
            'INTERNAL_ERROR',
            'Failed to ensure user row',
          );
        }

        if (after.email === email || after.updatedAt >= observedAt) {
          return this.toDomain(after);
        }

        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Failed to update user email',
        );
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
        .values({
          clerkUserId: clerkId,
          email,
          createdAt: observedAt,
          updatedAt: observedAt,
        })
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

    if (after.updatedAt >= observedAt) {
      return this.toDomain(after);
    }

    if (after.email === email) {
      return options?.observedAt
        ? this.bumpUpdatedAtIfStale(clerkId, observedAt)
        : this.toDomain(after);
    }

    // Update email after race condition
    try {
      const [updated] = await this.db
        .update(users)
        .set({ email, updatedAt: observedAt })
        .where(
          and(eq(users.clerkUserId, clerkId), lt(users.updatedAt, observedAt)),
        )
        .returning();

      if (updated) {
        return this.toDomain(updated);
      }

      const latest = await this.db.query.users.findFirst({
        where: eq(users.clerkUserId, clerkId),
      });
      if (!latest) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Failed to ensure user row',
        );
      }

      if (latest.email === email || latest.updatedAt >= observedAt) {
        return this.toDomain(latest);
      }

      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to update user email',
      );
    } catch (error) {
      throw this.mapDbError(error);
    }
  }

  async deleteByClerkId(clerkId: string): Promise<boolean> {
    try {
      const [deleted] = await this.db
        .delete(users)
        .where(eq(users.clerkUserId, clerkId))
        .returning({ id: users.id });

      return !!deleted;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to delete user by clerkId',
      );
    }
  }
}
