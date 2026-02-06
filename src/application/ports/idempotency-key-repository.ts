import type { ApplicationErrorCode } from '@/src/application/errors';

export type IdempotencyKeyError = {
  code: ApplicationErrorCode;
  message: string;
};

export type IdempotencyKeyRecord = {
  resultJson: unknown;
  error: IdempotencyKeyError | null;
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

  pruneExpiredBefore(cutoff: Date, limit: number): Promise<number>;
}
