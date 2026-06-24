import type { ApplicationErrorCode } from '@/src/application/errors';

export const DEFAULT_IDEMPOTENCY_ZOMBIE_THRESHOLD_MS = 60_000;

export type IdempotencyKeyError = {
  code: ApplicationErrorCode;
  message: string;
};

export type IdempotencyKeyRecord = {
  resultJson: unknown;
  error: IdempotencyKeyError | null;
  completedAt: Date | null;
  expiresAt: Date;
};

export interface IdempotencyKeyRepository {
  /**
   * Attempt to claim an idempotency key for exclusive execution.
   *
   * Returns:
   * - true when the key was inserted (caller should execute the operation)
   * - false when the key already exists (caller should read and reuse result)
   */
  claim(input: {
    userId: string;
    action: string;
    key: string;
    expiresAt: Date;
    zombieThresholdMs?: number;
  }): Promise<boolean>;

  /**
   * Read an existing idempotency record.
   *
   * Returns null when:
   * - no record exists, or
   * - the record has expired
   */
  find(
    userId: string,
    action: string,
    key: string,
  ): Promise<IdempotencyKeyRecord | null>;

  storeResult(input: {
    userId: string;
    action: string;
    key: string;
    resultJson: unknown;
  }): Promise<void>;

  storeError(input: {
    userId: string;
    action: string;
    key: string;
    error: IdempotencyKeyError;
  }): Promise<void>;

  /**
   * Remove a freshly claimed key that never reached execute/store.
   *
   * Must be a no-op for completed rows, stored-error rows, and missing keys.
   */
  abortClaim(userId: string, action: string, key: string): Promise<void>;

  pruneExpiredBefore(cutoff: Date, limit: number): Promise<number>;
}
