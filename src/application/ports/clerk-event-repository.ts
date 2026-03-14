export interface ClerkEventRepository {
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
   *
   * @throws ApplicationError with code 'NOT_FOUND' when the event does not exist.
   */
  lock(eventId: string): Promise<{
    processedAt: Date | null;
    error: string | null;
  }>;

  /**
   * @throws ApplicationError with code 'NOT_FOUND' when the event does not exist.
   */
  markProcessed(eventId: string): Promise<void>;

  /**
   * @throws ApplicationError with code 'NOT_FOUND' when the event does not exist.
   */
  markFailed(eventId: string, error: string): Promise<void>;
}
