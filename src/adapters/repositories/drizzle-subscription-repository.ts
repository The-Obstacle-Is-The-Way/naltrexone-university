import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { stripeSubscriptions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  SubscriptionRepository,
  SubscriptionUpsertInput,
} from '@/src/application/ports/repositories';
import {
  getStripePriceId,
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '../config/stripe-prices';
import { isPostgresUniqueViolation } from './postgres-errors';

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

  async findByStripeSubscriptionId(stripeSubscriptionId: string) {
    const row = await this.db.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, stripeSubscriptionId),
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

  async upsert(input: SubscriptionUpsertInput): Promise<void> {
    const priceId = getStripePriceId(input.plan, this.priceIds);

    try {
      await this.db
        .insert(stripeSubscriptions)
        .values({
          userId: input.userId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          status: input.status,
          priceId,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: stripeSubscriptions.userId,
          set: {
            stripeSubscriptionId: input.stripeSubscriptionId,
            status: input.status,
            priceId,
            currentPeriodEnd: input.currentPeriodEnd,
            cancelAtPeriodEnd: input.cancelAtPeriodEnd,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ApplicationError(
          'CONFLICT',
          'Stripe subscription id is already mapped to a different user',
        );
      }

      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to upsert subscription',
      );
    }
  }
}
