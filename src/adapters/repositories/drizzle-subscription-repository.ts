import { eq } from 'drizzle-orm';
import { stripeSubscriptions } from '@/db/schema';
import {
  ApplicationError,
  SubscriptionUserMissingError,
} from '@/src/application/errors';
import type {
  SubscriptionRepository,
  SubscriptionUpsertInput,
  SubscriptionUpsertResult,
} from '@/src/application/ports/repositories';
import type { Subscription } from '@/src/domain/entities';
import { shouldPersistSubscriptionWrite } from '@/src/domain/services';
import {
  getStripePriceId,
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '../config/stripe-prices';
import {
  stripeSubscriptionStatusToSubscriptionStatus,
  subscriptionStatusToStripeSubscriptionStatus,
} from '../gateways/stripe';
import type { DrizzleDb } from '../shared/database-types';
import {
  getPostgresConstraintName,
  getPostgresErrorCode,
  isPostgresUniqueViolation,
} from './postgres-errors';
import { acquireSubscriptionWriteLock } from './subscription-write-lock';

type StripeSubscriptionRow = typeof stripeSubscriptions.$inferSelect;

const FOREIGN_KEY_VIOLATION_SQLSTATE = '23503';
const SUBSCRIPTION_USER_FOREIGN_KEY =
  'stripe_subscriptions_user_id_users_id_fk';

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

  async findExternalSubscriptionIdByUserId(userId: string) {
    const row = await this.db.query.stripeSubscriptions.findFirst({
      columns: { stripeSubscriptionId: true },
      where: eq(stripeSubscriptions.userId, userId),
    });

    return row?.stripeSubscriptionId ?? null;
  }

  async findObservationVersionByUserId(userId: string) {
    const row = await this.db.query.stripeSubscriptions.findFirst({
      columns: { version: true },
      where: eq(stripeSubscriptions.userId, userId),
    });

    return row?.version ?? null;
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

  async upsert(
    input: SubscriptionUpsertInput,
  ): Promise<SubscriptionUpsertResult> {
    const priceId = getStripePriceId(input.plan, this.priceIds);
    const stripeStatus = subscriptionStatusToStripeSubscriptionStatus(
      input.status,
    );
    try {
      return await this.db.transaction(async (tx) => {
        await acquireSubscriptionWriteLock(tx, input.userId);
        const updatedAt = this.now();
        const [existingRow] = await tx
          .select()
          .from(stripeSubscriptions)
          .where(eq(stripeSubscriptions.userId, input.userId))
          .for('update');
        const storedVersion = existingRow ? existingRow.version : null;
        if (storedVersion !== input.expectedVersion) {
          return { persisted: false, reason: 'version_conflict' };
        }

        if (
          existingRow &&
          !shouldPersistSubscriptionWrite({
            stored: {
              subscriptionIdentity: existingRow.stripeSubscriptionId,
              status: stripeSubscriptionStatusToSubscriptionStatus(
                existingRow.status,
              ),
              currentPeriodEnd: existingRow.currentPeriodEnd,
            },
            incoming: {
              subscriptionIdentity: input.externalSubscriptionId,
              status: input.status,
              currentPeriodEnd: input.currentPeriodEnd,
            },
            now: updatedAt,
          })
        ) {
          return {
            persisted: false,
            reason: 'write_guard_rejected',
            current: this.toDomain(existingRow),
          };
        }

        const nextVersion = (storedVersion ?? 0) + 1;
        await tx
          .insert(stripeSubscriptions)
          .values({
            userId: input.userId,
            stripeSubscriptionId: input.externalSubscriptionId,
            status: stripeStatus,
            priceId,
            currentPeriodEnd: input.currentPeriodEnd,
            cancelAtPeriodEnd: input.cancelAtPeriodEnd,
            version: nextVersion,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: stripeSubscriptions.userId,
            set: {
              stripeSubscriptionId: input.externalSubscriptionId,
              status: stripeStatus,
              priceId,
              currentPeriodEnd: input.currentPeriodEnd,
              cancelAtPeriodEnd: input.cancelAtPeriodEnd,
              version: nextVersion,
              updatedAt,
            },
          });
        return { persisted: true };
      });
    } catch (error) {
      const isForeignKeyViolation =
        getPostgresErrorCode(error) === FOREIGN_KEY_VIOLATION_SQLSTATE;
      const isSubscriptionUserConstraint =
        getPostgresConstraintName(error) === SUBSCRIPTION_USER_FOREIGN_KEY;

      if (isForeignKeyViolation && isSubscriptionUserConstraint) {
        throw new SubscriptionUserMissingError(input.userId, { cause: error });
      }

      if (isPostgresUniqueViolation(error)) {
        throw new ApplicationError(
          'CONFLICT',
          'External subscription id is already mapped to a different user',
        );
      }

      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to upsert subscription',
        undefined,
        { cause: error },
      );
    }
  }
}
