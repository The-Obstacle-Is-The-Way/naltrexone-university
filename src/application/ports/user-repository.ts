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
   * Find a user by their external Clerk ID.
   */
  findByClerkId(clerkId: string): Promise<User | null>;

  /**
   * Upsert a user by their Clerk ID.
   *
   * - If user doesn't exist, creates a new user row.
   * - If user exists with same email, returns existing user.
   * - If user exists with different email, updates the email.
   *
   * This handles race conditions with ON CONFLICT gracefully.
   */
  upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User>;

  /**
   * Delete a user by their external Clerk ID.
   *
   * Returns:
   * - true when a user row was deleted
   * - false when no user row existed
   */
  deleteByClerkId(clerkId: string): Promise<boolean>;
}
