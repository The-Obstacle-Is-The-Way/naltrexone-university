import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import { idempotencyKeys } from '@/db/schema';
import {
  ApplicationError,
  type ApplicationErrorCode,
} from '@/src/application/errors';
import {
  DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS,
  type IdempotencyKeyRecord,
  type IdempotencyKeyRepository,
} from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleIdempotencyKeyRepository
  implements IdempotencyKeyRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async claim(input: {
    userId: string;
    action: string;
    key: string;
    expiresAt: Date;
    zombieThresholdMs?: number;
  }): Promise<Date | null> {
    const now = this.now();
    const zombieThresholdMs =
      typeof input.zombieThresholdMs === 'number' &&
      Number.isFinite(input.zombieThresholdMs) &&
      input.zombieThresholdMs >= 0
        ? input.zombieThresholdMs
        : DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS;
    const zombieCutoff = new Date(now.getTime() - zombieThresholdMs);

    const [row] = await this.db
      .insert(idempotencyKeys)
      .values({
        userId: input.userId,
        action: input.action,
        key: input.key,
        resultJson: null,
        errorCode: null,
        errorMessage: null,
        claimedAt: now,
        completedAt: null,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing({
        target: [
          idempotencyKeys.userId,
          idempotencyKeys.action,
          idempotencyKeys.key,
        ],
      })
      .returning({ claimedAt: idempotencyKeys.claimedAt });

    if (row) return row.claimedAt;

    const [updated] = await this.db
      .update(idempotencyKeys)
      .set({
        resultJson: null,
        errorCode: null,
        errorMessage: null,
        claimedAt: now,
        completedAt: null,
        expiresAt: input.expiresAt,
      })
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.action, input.action),
          eq(idempotencyKeys.key, input.key),
          or(
            lt(idempotencyKeys.expiresAt, now),
            and(
              isNull(idempotencyKeys.completedAt),
              isNull(idempotencyKeys.errorCode),
              lt(idempotencyKeys.claimedAt, zombieCutoff),
            ),
          ),
        ),
      )
      .returning({ claimedAt: idempotencyKeys.claimedAt });

    return updated?.claimedAt ?? null;
  }

  async find(
    userId: string,
    action: string,
    key: string,
  ): Promise<IdempotencyKeyRecord | null> {
    const [row] = await this.db
      .select({
        resultJson: idempotencyKeys.resultJson,
        errorCode: idempotencyKeys.errorCode,
        errorMessage: idempotencyKeys.errorMessage,
        completedAt: idempotencyKeys.completedAt,
        expiresAt: idempotencyKeys.expiresAt,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.action, action),
          eq(idempotencyKeys.key, key),
        ),
      );

    if (!row) return null;

    if (row.expiresAt.getTime() < this.now().getTime()) {
      return null;
    }

    return {
      resultJson: row.resultJson ?? null,
      error: row.errorCode
        ? {
            code: row.errorCode as ApplicationErrorCode,
            message: row.errorMessage ?? row.errorCode,
          }
        : null,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    };
  }

  async storeResult(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    resultJson: unknown;
  }): Promise<void> {
    const [updated] = await this.db
      .update(idempotencyKeys)
      .set({
        resultJson: input.resultJson,
        errorCode: null,
        errorMessage: null,
        completedAt: this.now(),
      })
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.action, input.action),
          eq(idempotencyKeys.key, input.key),
          eq(idempotencyKeys.claimedAt, input.claimedAt),
          isNull(idempotencyKeys.completedAt),
        ),
      )
      .returning({ key: idempotencyKeys.key });

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }
  }

  async storeError(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    error: { code: ApplicationErrorCode; message: string };
  }): Promise<void> {
    const [updated] = await this.db
      .update(idempotencyKeys)
      .set({
        resultJson: null,
        errorCode: input.error.code,
        errorMessage: input.error.message,
        completedAt: this.now(),
      })
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.action, input.action),
          eq(idempotencyKeys.key, input.key),
          eq(idempotencyKeys.claimedAt, input.claimedAt),
          isNull(idempotencyKeys.completedAt),
        ),
      )
      .returning({ key: idempotencyKeys.key });

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }
  }

  async abortClaim(
    userId: string,
    action: string,
    key: string,
    claimedAt: Date,
  ): Promise<void> {
    await this.db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.action, action),
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.claimedAt, claimedAt),
          isNull(idempotencyKeys.completedAt),
          isNull(idempotencyKeys.errorCode),
        ),
      );
  }

  async pruneExpiredBefore(cutoff: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) {
      return 0;
    }

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          userId: idempotencyKeys.userId,
          action: idempotencyKeys.action,
          key: idempotencyKeys.key,
          expiresAt: idempotencyKeys.expiresAt,
        })
        .from(idempotencyKeys)
        .where(lt(idempotencyKeys.expiresAt, cutoff))
        .orderBy(asc(idempotencyKeys.expiresAt))
        .limit(limit);

      if (rows.length === 0) return 0;

      const conditions = rows.map((row) =>
        and(
          eq(idempotencyKeys.userId, row.userId),
          eq(idempotencyKeys.action, row.action),
          eq(idempotencyKeys.key, row.key),
          lt(idempotencyKeys.expiresAt, cutoff),
        ),
      );

      const deleted = await tx
        .delete(idempotencyKeys)
        .where(or(...conditions))
        .returning({ key: idempotencyKeys.key });

      return deleted.length;
    });
  }
}
