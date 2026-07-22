import {
  ApplicationError,
  decodeIdempotencyPublicError,
  encodeIdempotencyPublicError,
} from '@/src/application/errors';
import {
  DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS,
  type IdempotencyKeyError,
  type IdempotencyKeyRecord,
  type IdempotencyKeyRepository,
} from '@/src/application/ports/repositories';

type InMemoryIdempotencyRecord = {
  resultJson: unknown;
  error: unknown;
  hasStoredError: boolean;
  claimedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
};

export class FakeIdempotencyKeyRepository implements IdempotencyKeyRepository {
  private readonly records = new Map<string, InMemoryIdempotencyRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private toKey(userId: string, action: string, key: string): string {
    return `${userId}:${action}:${key}`;
  }

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
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (existing) {
      const isExpired = existing.expiresAt.getTime() < now.getTime();
      const isZombie =
        existing.completedAt === null &&
        !existing.hasStoredError &&
        existing.claimedAt.getTime() < zombieCutoff.getTime();
      if (!isExpired && !isZombie) {
        return null;
      }
    }

    this.records.set(id, {
      resultJson: null,
      error: null,
      hasStoredError: false,
      claimedAt: now,
      completedAt: null,
      expiresAt: input.expiresAt,
    });
    return now;
  }

  async find(
    userId: string,
    action: string,
    key: string,
  ): Promise<IdempotencyKeyRecord | null> {
    const id = this.toKey(userId, action, key);
    const existing = this.records.get(id);
    if (!existing) return null;

    if (existing.expiresAt.getTime() < this.now().getTime()) {
      return null;
    }

    return {
      resultJson: existing.resultJson,
      error: existing.hasStoredError
        ? decodeIdempotencyPublicError(existing.error)
        : null,
      completedAt: existing.completedAt,
      expiresAt: existing.expiresAt,
    };
  }

  async storeResult(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    resultJson: unknown;
  }): Promise<void> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (
      !existing ||
      existing.claimedAt.getTime() !== input.claimedAt.getTime() ||
      existing.completedAt !== null
    ) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }

    this.records.set(id, {
      ...existing,
      resultJson: input.resultJson,
      error: null,
      hasStoredError: false,
      completedAt: this.now(),
    });
  }

  async storeError(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    error: IdempotencyKeyError;
  }): Promise<void> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (
      !existing ||
      existing.claimedAt.getTime() !== input.claimedAt.getTime() ||
      existing.completedAt !== null
    ) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }

    this.records.set(id, {
      ...existing,
      resultJson: null,
      error: encodeIdempotencyPublicError(input.error),
      hasStoredError: true,
      completedAt: this.now(),
    });
  }

  /** Test-only corruption seam for exercising durable decoder behavior. */
  seedRawErrorRecord(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    completedAt: Date;
    expiresAt: Date;
    error: unknown;
  }): void {
    this.records.set(this.toKey(input.userId, input.action, input.key), {
      resultJson: null,
      error: input.error,
      hasStoredError: true,
      claimedAt: input.claimedAt,
      completedAt: input.completedAt,
      expiresAt: input.expiresAt,
    });
  }

  async abortClaim(
    userId: string,
    action: string,
    key: string,
    claimedAt: Date,
  ): Promise<void> {
    const id = this.toKey(userId, action, key);
    const existing = this.records.get(id);
    if (!existing || existing.completedAt !== null || existing.hasStoredError) {
      return;
    }
    if (existing.claimedAt.getTime() !== claimedAt.getTime()) {
      return;
    }

    this.records.delete(id);
  }

  async pruneExpiredBefore(cutoff: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) {
      return 0;
    }

    const rows = Array.from(this.records.entries())
      .filter(([, record]) => record.expiresAt.getTime() < cutoff.getTime())
      .sort(([, a], [, b]) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, limit);

    for (const [id] of rows) {
      this.records.delete(id);
    }

    return rows.length;
  }
}
