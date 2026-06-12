export type PendingStripeCancellation = {
  eventId: string;
  stripeCustomerId: string;
  createdAt: Date;
};

export interface PendingStripeCancellationRepository {
  findByEventId(eventId: string): Promise<{ stripeCustomerId: string } | null>;
  schedule(eventId: string, stripeCustomerId: string): Promise<void>;
  deleteByEventId(eventId: string): Promise<void>;
  listStale(olderThan: Date): Promise<PendingStripeCancellation[]>;
}
