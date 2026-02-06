export interface StripeEventRepository {
  /**
   * Insert the event row if missing (idempotent).
   * Returns true if the row was inserted (claimed), false if it already existed.
   */
  claim(eventId: string, type: string): Promise<boolean>;

  /**
   * Read the event row without acquiring an update lock.
   * Returns null when the row does not exist.
   */
  peek(eventId: string): Promise<{
    processedAt: Date | null;
    error: string | null;
  } | null>;

  /**
   * Lock the event row for exclusive processing and return its current state.
   *
   * IMPORTANT: This must be called inside a transaction.
   */
  lock(eventId: string): Promise<{
    processedAt: Date | null;
    error: string | null;
  }>;

  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;

  /**
   * Delete old, successfully-processed webhook events to keep the table bounded.
   *
   * Constraints:
   * - Only deletes rows where `processedAt` is not null.
   * - Deletes at most `limit` rows per call.
   *
   * Returns:
   * - Number of rows deleted.
   */
  pruneProcessedBefore(cutoff: Date, limit: number): Promise<number>;
}
