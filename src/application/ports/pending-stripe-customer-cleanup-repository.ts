export type PendingStripeCustomerCleanup = {
  eventId: string;
  stripeCustomerId: string;
  createdAt: Date;
};

/**
 * Durable obligations to delete Stripe Customers after local account deletion.
 */
export interface PendingStripeCustomerCleanupRepository {
  findByEventId(eventId: string): Promise<{ stripeCustomerId: string } | null>;
  schedule(eventId: string, stripeCustomerId: string): Promise<void>;
  deleteByEventId(eventId: string): Promise<void>;
  listStale(
    olderThan: Date,
    limit: number,
    excludeEventIds?: readonly string[],
  ): Promise<PendingStripeCustomerCleanup[]>;
}
