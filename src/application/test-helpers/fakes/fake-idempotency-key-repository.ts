import { ApplicationError } from '@/src/application/errors';
import type {
  IdempotencyKeyError,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
} from '@/src/application/ports/repositories';

type InMemoryIdempotencyRecord = {
  resultJson: unknown;
  error: IdempotencyKeyError | null;
  claimedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
};

const DEFAULT_ZOMBIE_THRESHOLD_MS = 60_000;

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
  }): Promise<boolean> {
    const now = this.now();
    const zombieThresholdMs =
      typeof input.zombieThresholdMs === 'number' &&
      Number.isFinite(input.zombieThresholdMs) &&
      input.zombieThresholdMs >= 0
        ? input.zombieThresholdMs
        : DEFAULT_ZOMBIE_THRESHOLD_MS;
    const zombieCutoff = new Date(now.getTime() - zombieThresholdMs);
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (existing) {
      const isExpired = existing.expiresAt.getTime() < now.getTime();
      const isZombie =
        existing.completedAt === null &&
        existing.error === null &&
        existing.claimedAt.getTime() < zombieCutoff.getTime();
      if (!isExpired && !isZombie) {
        return false;
      }
    }

    this.records.set(id, {
      resultJson: null,
      error: null,
      claimedAt: now,
      completedAt: null,
      expiresAt: input.expiresAt,
    });
    return true;
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
      error: existing.error,
      completedAt: existing.completedAt,
      expiresAt: existing.expiresAt,
    };
  }

  async storeResult(input: {
    userId: string;
    action: string;
    key: string;
    resultJson: unknown;
  }): Promise<void> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }

    this.records.set(id, {
      ...existing,
      resultJson: input.resultJson,
      error: null,
      completedAt: this.now(),
    });
  }

  async storeError(input: {
    userId: string;
    action: string;
    key: string;
    error: IdempotencyKeyError;
  }): Promise<void> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }

    this.records.set(id, {
      ...existing,
      resultJson: null,
      error: input.error,
      completedAt: this.now(),
    });
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
