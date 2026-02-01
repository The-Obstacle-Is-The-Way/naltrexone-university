import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { users } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { User } from '@/src/domain/entities';
import { getPostgresErrorCode } from '../repositories/postgres-errors';

type Db = PostgresJsDatabase<typeof schema>;

type ClerkEmailAddressLike = {
  id?: string;
  emailAddress: string;
};

type ClerkUserLike = {
  id: string;
  primaryEmailAddressId?: string | null;
  emailAddresses: readonly ClerkEmailAddressLike[];
};

export type ClerkAuthGatewayDeps = {
  db: Db;
  getClerkUser: () => Promise<ClerkUserLike | null>;
  now?: () => Date;
};

export class ClerkAuthGateway implements AuthGateway {
  constructor(private readonly deps: ClerkAuthGatewayDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private getEmailOrNull(user: ClerkUserLike): string | null {
    if (user.emailAddresses.length === 0) return null;

    const primaryId = user.primaryEmailAddressId;
    if (primaryId) {
      const primary = user.emailAddresses.find((e) => e.id === primaryId);
      if (primary?.emailAddress) return primary.emailAddress;
    }

    return user.emailAddresses[0]?.emailAddress ?? null;
  }

  private mapDbError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) return error;

    if (getPostgresErrorCode(error) === '23505') {
      return new ApplicationError(
        'CONFLICT',
        'User could not be upserted due to a uniqueness constraint',
      );
    }

    return new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
  }

  private toDomainUser(row: {
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

  private async ensureUserRow(
    clerkUserId: string,
    email: string,
  ): Promise<{
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const existing = await this.deps.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
    });

    if (existing) {
      if (existing.email === email) {
        return existing;
      }

      try {
        const [updated] = await this.deps.db
          .update(users)
          .set({
            email,
            updatedAt: this.now(),
          })
          .where(eq(users.clerkUserId, clerkUserId))
          .returning();

        return updated ?? existing;
      } catch (error) {
        throw this.mapDbError(error);
      }
    }

    let inserted:
      | {
          id: string;
          email: string;
          createdAt: Date;
          updatedAt: Date;
        }
      | undefined;

    try {
      [inserted] = await this.deps.db
        .insert(users)
        .values({ clerkUserId, email })
        .onConflictDoNothing({ target: users.clerkUserId })
        .returning();
    } catch (error) {
      throw this.mapDbError(error);
    }

    if (inserted) {
      return inserted;
    }

    const after = await this.deps.db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
    });

    if (!after) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
    }

    if (after.email === email) {
      return after;
    }

    try {
      const [updated] = await this.deps.db
        .update(users)
        .set({
          email,
          updatedAt: this.now(),
        })
        .where(eq(users.clerkUserId, clerkUserId))
        .returning();

      return updated ?? after;
    } catch (error) {
      throw this.mapDbError(error);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    const clerkUser = await this.deps.getClerkUser();
    if (!clerkUser) return null;

    const email = this.getEmailOrNull(clerkUser);
    if (!email) {
      throw new ApplicationError('INTERNAL_ERROR', 'User has no email address');
    }

    const row = await this.ensureUserRow(clerkUser.id, email);
    return this.toDomainUser(row);
  }

  async requireUser(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
    }
    return user;
  }
}
