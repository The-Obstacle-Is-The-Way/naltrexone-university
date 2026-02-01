import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { stripeSubscriptions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import {
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '../config/stripe-prices';

type Db = PostgresJsDatabase<typeof schema>;

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(
    private readonly db: Db,
    private readonly priceIds: StripePriceIds,
  ) {}

  async findByUserId(userId: string) {
    const row = await this.db.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.userId, userId),
    });

    if (!row) return null;

    const plan = getSubscriptionPlanFromPriceId(row.priceId, this.priceIds);
    if (!plan) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Unknown Stripe price id "${row.priceId}" for subscription ${row.id}`,
      );
    }

    return {
      id: row.id,
      userId: row.userId,
      plan,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
