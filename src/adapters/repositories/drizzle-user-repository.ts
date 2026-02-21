import { eq, sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  UpsertUserByClerkIdOptions,
  UserRepository,
} from '@/src/application/ports/repositories';
import type { User } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from './postgres-errors';

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

  async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User> {
    const observedAt = options?.observedAt ?? this.now();
    const observedAtParam = sql.param(observedAt, users.updatedAt);

    try {
      const [row] = await this.db
        .insert(users)
        .values({
          clerkUserId: clerkId,
          email,
          createdAt: observedAt,
          updatedAt: observedAt,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${email} ELSE ${users.email} END`,
            updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
          },
        })
        .returning();

      if (!row) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Failed to ensure user row',
        );
      }

      return this.toDomain(row);
    } catch (error) {
      if (
        isPostgresUniqueViolation(error) &&
        getPostgresConstraintName(error) === 'users_email_uq'
      ) {
        const [row] = await this.db
          .update(users)
          .set({
            clerkUserId: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${clerkId} ELSE ${users.clerkUserId} END`,
            updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
          })
          .where(eq(users.email, email))
          .returning();

        if (!row) {
          throw new ApplicationError(
            'INTERNAL_ERROR',
            'Failed to ensure user row',
          );
        }

        return this.toDomain(row);
      }

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
