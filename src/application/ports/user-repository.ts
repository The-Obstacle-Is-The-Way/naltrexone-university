import type { User } from '@/src/domain/entities';

/**
 * Optional metadata for ordering concurrent updates.
 *
 * - `observedAt` should represent the source-of-truth timestamp for the email
 *   value (e.g., Clerk `updated_at`).
 */
export type UpsertUserByClerkIdOptions = {
  observedAt?: Date;
};

export interface UserRepository {
  /**
   * Find a user by the application-owned UUID.
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find a user by their external Clerk ID.
   */
  findByClerkId(clerkId: string): Promise<User | null>;

  /**
   * Lock a user row by Clerk ID for exclusive mutation inside a transaction.
   *
   * IMPORTANT: This must be called inside a transaction.
   */
  lockByClerkId(clerkId: string): Promise<User | null>;

  /**
   * Acquire the transaction-scoped lock shared by every subscription writer.
   *
   * IMPORTANT: This must be called inside a transaction before deleting a
   * user whose FK cascades can mutate subscription tables.
   */
  acquireSubscriptionWriteLock(userId: string): Promise<void>;

  /**
   * Upsert a user by their Clerk ID.
   *
   * - If user doesn't exist, creates a new user row.
   * - If user exists with same email, returns existing user.
   * - If user exists with different email, updates the email.
   * - If another Clerk identity owns the email, fails with a typed conflict.
   *
   * This handles race conditions with ON CONFLICT gracefully.
   */
  upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User>;

  /**
   * Synchronize an existing Clerk identity's email without creating a row.
   *
   * Returns null when the Clerk identity is not present locally.
   * Fails with a typed conflict when another Clerk identity owns the email.
   */
  updateEmailByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User | null>;

  /**
   * Delete a user by their external Clerk ID.
   *
   * Returns:
   * - true when a user row was deleted
   * - false when no user row existed
   */
  deleteByClerkId(clerkId: string): Promise<boolean>;
}
