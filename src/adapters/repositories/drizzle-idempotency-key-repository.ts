import { and, asc, eq, lt, or } from 'drizzle-orm';
import { idempotencyKeys } from '@/db/schema';
import {
  ApplicationError,
  type ApplicationErrorCode,
} from '@/src/application/errors';
import type {
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
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
  }): Promise<boolean> {
    const [row] = await this.db
      .insert(idempotencyKeys)
      .values({
        userId: input.userId,
        action: input.action,
        key: input.key,
        resultJson: null,
        errorCode: null,
        errorMessage: null,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing({
        target: [
          idempotencyKeys.userId,
          idempotencyKeys.action,
          idempotencyKeys.key,
        ],
      })
      .returning({ key: idempotencyKeys.key });

    if (row) return true;

    const [updated] = await this.db
      .update(idempotencyKeys)
      .set({
        resultJson: null,
        errorCode: null,
        errorMessage: null,
        expiresAt: input.expiresAt,
      })
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.action, input.action),
          eq(idempotencyKeys.key, input.key),
          lt(idempotencyKeys.expiresAt, this.now()),
        ),
      )
      .returning({ key: idempotencyKeys.key });

    return !!updated;
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
      expiresAt: row.expiresAt,
    };
  }

  async storeResult(input: {
    userId: string;
    action: string;
    key: string;
    resultJson: unknown;
  }): Promise<void> {
    const [updated] = await this.db
      .update(idempotencyKeys)
      .set({
        resultJson: input.resultJson,
        errorCode: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.action, input.action),
          eq(idempotencyKeys.key, input.key),
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
    error: { code: ApplicationErrorCode; message: string };
  }): Promise<void> {
    const [updated] = await this.db
      .update(idempotencyKeys)
      .set({
        resultJson: null,
        errorCode: input.error.code,
        errorMessage: input.error.message,
      })
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.action, input.action),
          eq(idempotencyKeys.key, input.key),
        ),
      )
      .returning({ key: idempotencyKeys.key });

    if (!updated) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }
  }

  async pruneExpiredBefore(cutoff: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) {
      return 0;
    }

    const rows = await this.db
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
      ),
    );

    const deleted = await this.db
      .delete(idempotencyKeys)
      .where(or(...conditions))
      .returning({ key: idempotencyKeys.key });

    return deleted.length;
  }
}
