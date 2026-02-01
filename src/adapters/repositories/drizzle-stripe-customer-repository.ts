import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { stripeCustomers } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { StripeCustomerRepository } from '@/src/application/ports/repositories';

type Db = PostgresJsDatabase<typeof schema>;

export class DrizzleStripeCustomerRepository
  implements StripeCustomerRepository
{
  constructor(private readonly db: Db) {}

  async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const row = await this.db.query.stripeCustomers.findFirst({
      where: eq(stripeCustomers.userId, userId),
    });

    if (!row) return null;
    return { stripeCustomerId: row.stripeCustomerId };
  }

  async insert(userId: string, stripeCustomerId: string): Promise<void> {
    const [inserted] = await this.db
      .insert(stripeCustomers)
      .values({ userId, stripeCustomerId })
      .onConflictDoNothing({ target: stripeCustomers.userId })
      .returning();

    if (inserted) return;

    const existing = await this.db.query.stripeCustomers.findFirst({
      where: eq(stripeCustomers.userId, userId),
    });

    if (!existing) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to insert Stripe customer (missing after conflict)',
      );
    }

    if (existing.stripeCustomerId !== stripeCustomerId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer already exists with a different stripeCustomerId',
      );
    }
  }
}
