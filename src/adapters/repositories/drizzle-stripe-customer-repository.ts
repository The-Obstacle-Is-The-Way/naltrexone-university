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
      .onConflictDoNothing()
      .returning();

    if (inserted) return;

    const existingByUserId = await this.db.query.stripeCustomers.findFirst({
      where: eq(stripeCustomers.userId, userId),
    });

    if (existingByUserId) {
      if (existingByUserId.stripeCustomerId === stripeCustomerId) return;
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer already exists with a different stripeCustomerId',
      );
    }

    const existingByStripeCustomerId =
      await this.db.query.stripeCustomers.findFirst({
        where: eq(stripeCustomers.stripeCustomerId, stripeCustomerId),
      });

    if (existingByStripeCustomerId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer id is already mapped to a different user',
      );
    }

    throw new ApplicationError(
      'CONFLICT',
      'Stripe customer insert raced; please retry',
    );
  }
}
