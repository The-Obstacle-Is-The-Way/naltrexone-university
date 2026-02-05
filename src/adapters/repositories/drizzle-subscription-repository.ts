import { eq } from 'drizzle-orm';
import { stripeSubscriptions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  SubscriptionRepository,
  SubscriptionUpsertInput,
} from '@/src/application/ports/repositories';
import type { Subscription } from '@/src/domain/entities';
import {
  getStripePriceId,
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '../config/stripe-prices';
import {
  stripeSubscriptionStatusToSubscriptionStatus,
  subscriptionStatusToStripeSubscriptionStatus,
} from '../gateways/stripe/stripe-subscription-status';
import type { DrizzleDb } from '../shared/database-types';
import { isPostgresUniqueViolation } from './postgres-errors';

type StripeSubscriptionRow = typeof stripeSubscriptions.$inferSelect;

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly priceIds: StripePriceIds,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toDomain(row: StripeSubscriptionRow): Subscription {
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
      status: stripeSubscriptionStatusToSubscriptionStatus(row.status),
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByUserId(userId: string) {
    const row = await this.db.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.userId, userId),
    });

    return row ? this.toDomain(row) : null;
  }

  async findByExternalSubscriptionId(externalSubscriptionId: string) {
    const row = await this.db.query.stripeSubscriptions.findFirst({
      where: eq(
        stripeSubscriptions.stripeSubscriptionId,
        externalSubscriptionId,
      ),
    });

    return row ? this.toDomain(row) : null;
  }

  async upsert(input: SubscriptionUpsertInput): Promise<void> {
    const priceId = getStripePriceId(input.plan, this.priceIds);
    const stripeStatus = subscriptionStatusToStripeSubscriptionStatus(
      input.status,
    );

    try {
      await this.db
        .insert(stripeSubscriptions)
        .values({
          userId: input.userId,
          stripeSubscriptionId: input.externalSubscriptionId,
          status: stripeStatus,
          priceId,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          updatedAt: this.now(),
        })
        .onConflictDoUpdate({
          target: stripeSubscriptions.userId,
          set: {
            stripeSubscriptionId: input.externalSubscriptionId,
            status: stripeStatus,
            priceId,
            currentPeriodEnd: input.currentPeriodEnd,
            cancelAtPeriodEnd: input.cancelAtPeriodEnd,
            updatedAt: this.now(),
          },
        });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ApplicationError(
          'CONFLICT',
          'External subscription id is already mapped to a different user',
        );
      }

      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to upsert subscription',
      );
    }
  }
}
