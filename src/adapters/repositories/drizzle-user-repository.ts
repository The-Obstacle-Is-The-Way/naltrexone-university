import { eq, sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import {
  ApplicationError,
  UserEmailOwnershipConflictError,
} from '@/src/application/errors';
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
import { acquireSubscriptionWriteLock } from './subscription-write-lock';

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

    return new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to ensure user row',
      undefined,
      { cause: error },
    );
  }

  private async mapEmailWriteError(
    error: unknown,
    clerkId: string,
    email: string,
  ): Promise<ApplicationError> {
    if (
      isPostgresUniqueViolation(error) &&
      getPostgresConstraintName(error) === 'users_email_uq'
    ) {
      try {
        const owner = await this.db.query.users.findFirst({
          columns: { clerkUserId: true },
          where: eq(users.email, email),
        });

        if (owner && owner.clerkUserId !== clerkId) {
          return new UserEmailOwnershipConflictError(owner.clerkUserId, {
            cause: error,
          });
        }
      } catch (lookupError) {
        return this.mapDbError(lookupError);
      }
    }

    return this.mapDbError(error);
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkId),
    });

    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    return row ? this.toDomain(row) : null;
  }

  async lockByClerkId(clerkId: string): Promise<User | null> {
    // Transaction precondition: FOR UPDATE protects the following identity
    // workflow only when this repository was constructed from its callback tx.
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.clerkUserId, clerkId))
      .for('update');

    return row ? this.toDomain(row) : null;
  }

  async acquireSubscriptionWriteLock(userId: string): Promise<void> {
    // Transaction precondition: the shared xact lock spans later subscription
    // or deletion writes only when this repository is bound to the caller's tx.
    await acquireSubscriptionWriteLock(this.db, userId);
  }

  async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User> {
    const observedAt = options?.observedAt ?? this.now();
    const observedAtParam = sql.param(observedAt, users.updatedAt);

    try {
      const row = await this.db.transaction(async (tx) => {
        const [upserted] = await tx
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

        if (!upserted) {
          throw new ApplicationError(
            'INTERNAL_ERROR',
            'Failed to ensure user row',
          );
        }

        return upserted;
      });

      return this.toDomain(row);
    } catch (error) {
      throw await this.mapEmailWriteError(error, clerkId, email);
    }
  }

  async updateEmailByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User | null> {
    const observedAt = options?.observedAt ?? this.now();
    const observedAtParam = sql.param(observedAt, users.updatedAt);

    try {
      const row = await this.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(users)
          .set({
            email: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${email} ELSE ${users.email} END`,
            updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
          })
          .where(eq(users.clerkUserId, clerkId))
          .returning();

        return updated ?? null;
      });

      return row ? this.toDomain(row) : null;
    } catch (error) {
      throw await this.mapEmailWriteError(error, clerkId, email);
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
      // Preserve the driver error (e.g. SQLSTATE 40P01 from a cascade lock
      // cycle) so failed-event rows and logs can distinguish deadlocks.
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to delete user by clerkId',
        undefined,
        { cause: error },
      );
    }
  }
}
