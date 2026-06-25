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
   * - the claimedAt token when the key was inserted/reclaimed
   * - null when the key already exists (caller should read and reuse result)
   */
  claim(input: {
    userId: string;
    action: string;
    key: string;
    expiresAt: Date;
    zombieThresholdMs?: number;
  }): Promise<Date | null>;

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

  /**
   * Persist the first successful result for the exact still-pending claim.
   *
   * Must reject missing, reclaimed, or already completed rows so cached
   * idempotency outcomes remain immutable after first completion.
   */
  storeResult(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    resultJson: unknown;
  }): Promise<void>;

  /**
   * Persist the first failure record for the exact still-pending claim.
   *
   * Must reject missing, reclaimed, or already completed rows so cached
   * idempotency outcomes remain immutable after first completion.
   */
  storeError(input: {
    userId: string;
    action: string;
    key: string;
    claimedAt: Date;
    error: IdempotencyKeyError;
  }): Promise<void>;

  /**
   * Remove a freshly claimed key that never reached execute/store.
   *
   * Must be a no-op for completed rows, stored-error rows, and missing keys.
   */
  abortClaim(
    userId: string,
    action: string,
    key: string,
    claimedAt: Date,
  ): Promise<void>;

  pruneExpiredBefore(cutoff: Date, limit: number): Promise<number>;
}
