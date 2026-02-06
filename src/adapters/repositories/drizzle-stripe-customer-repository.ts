import { eq, sql } from 'drizzle-orm';
import { stripeCustomers } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { StripeCustomerRepository } from '@/src/application/ports/repositories';
import type { StripeCustomerInsertOptions } from '@/src/application/ports/stripe-customer-repository';
import type { DrizzleDb } from '../shared/database-types';
import { isPostgresUniqueViolation } from './postgres-errors';

export class DrizzleStripeCustomerRepository
  implements StripeCustomerRepository
{
  constructor(private readonly db: DrizzleDb) {}

  async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const row = await this.db.query.stripeCustomers.findFirst({
      where: eq(stripeCustomers.userId, userId),
    });

    if (!row) return null;
    return { stripeCustomerId: row.stripeCustomerId };
  }

  async insert(
    userId: string,
    stripeCustomerId: string,
    options?: StripeCustomerInsertOptions,
  ): Promise<void> {
    const conflictStrategy = options?.conflictStrategy ?? 'strict';

    try {
      const [row] = await this.db
        .insert(stripeCustomers)
        .values({ userId, stripeCustomerId })
        .onConflictDoUpdate({
          target: stripeCustomers.userId,
          set: {
            stripeCustomerId:
              conflictStrategy === 'authoritative'
                ? stripeCustomerId
                : // No-op update to make the statement return the existing row.
                  sql`${stripeCustomers.stripeCustomerId}`,
          },
        })
        .returning({ stripeCustomerId: stripeCustomers.stripeCustomerId });

      if (!row) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Failed to upsert Stripe customer mapping',
        );
      }

      if (
        conflictStrategy === 'strict' &&
        row.stripeCustomerId !== stripeCustomerId
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'Stripe customer already exists with a different stripeCustomerId',
        );
      }
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      if (isPostgresUniqueViolation(error)) {
        // Unique constraint violation on `stripeCustomerId`.
        throw new ApplicationError(
          'CONFLICT',
          'Stripe customer id is already mapped to a different user',
        );
      }

      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to upsert Stripe customer mapping',
      );
    }
  }
}
