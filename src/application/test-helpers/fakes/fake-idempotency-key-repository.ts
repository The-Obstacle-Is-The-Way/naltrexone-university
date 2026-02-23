import { ApplicationError } from '@/src/application/errors';
import type {
  IdempotencyKeyError,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
} from '@/src/application/ports/repositories';

type InMemoryIdempotencyRecord = {
  resultJson: unknown;
  error: IdempotencyKeyError | null;
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
  }): Promise<boolean> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (existing && existing.expiresAt.getTime() >= this.now().getTime()) {
      return false;
    }

    this.records.set(id, {
      resultJson: null,
      error: null,
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

    return existing;
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
