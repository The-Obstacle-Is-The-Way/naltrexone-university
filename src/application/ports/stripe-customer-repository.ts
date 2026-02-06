export interface StripeCustomerRepository {
  findByUserId(userId: string): Promise<{ stripeCustomerId: string } | null>;

  /**
   * Persist a 1:1 mapping between internal users and Stripe customers.
   *
   * Constraints:
   * - One internal user → one Stripe customer (unique by `userId`)
   * - One Stripe customer → one internal user (unique by `stripeCustomerId`)
   *
   * Behavior:
   * - Idempotent if the same mapping already exists.
   * - Rejects conflicting mappings.
   *
   * Expected failure:
   * - Throws `ApplicationError('CONFLICT', ...)` when the requested mapping
   *   conflicts with existing data.
   */
  insert(userId: string, stripeCustomerId: string): Promise<void>;
}
