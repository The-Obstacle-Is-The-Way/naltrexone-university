export interface DeletedClerkUserRepository {
  /**
   * Serialize `user.updated` / `user.deleted` processing for a single Clerk user ID.
   *
   * IMPORTANT: This must be called inside a transaction.
   */
  lock(clerkUserId: string): Promise<void>;
  exists(clerkUserId: string): Promise<boolean>;
  markDeleted(clerkUserId: string, deletedAt?: Date): Promise<void>;
}
