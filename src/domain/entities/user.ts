/**
 * User entity - represents an authenticated user.
 * Maps to `users` table but has no DB knowledge.
 */
export type User = {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
