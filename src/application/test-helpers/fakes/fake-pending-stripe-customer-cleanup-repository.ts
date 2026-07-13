import type {
  PendingStripeCustomerCleanup,
  PendingStripeCustomerCleanupRepository,
} from '@/src/application/ports/repositories';

type PendingStripeCustomerCleanupSnapshot = ReadonlyArray<
  readonly [string, { stripeCustomerId: string; createdAt: Date }]
>;

export class FakePendingStripeCustomerCleanupRepository
  implements PendingStripeCustomerCleanupRepository
{
  private readonly pendingByEventId = new Map<
    string,
    { stripeCustomerId: string; createdAt: Date }
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findByEventId(
    eventId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const pending = this.pendingByEventId.get(eventId);
    if (!pending) return null;
    return { stripeCustomerId: pending.stripeCustomerId };
  }

  async schedule(eventId: string, stripeCustomerId: string): Promise<void> {
    // Mirror the SQL ON CONFLICT DO UPDATE: only the customer id is
    // replaced; the obligation keeps its original staleness clock.
    const existing = this.pendingByEventId.get(eventId);
    this.pendingByEventId.set(eventId, {
      stripeCustomerId,
      createdAt: existing?.createdAt ?? this.now(),
    });
  }

  async deleteByEventId(eventId: string): Promise<void> {
    this.pendingByEventId.delete(eventId);
  }

  async listStale(
    olderThan: Date,
    limit: number,
    excludeEventIds: readonly string[] = [],
  ): Promise<PendingStripeCustomerCleanup[]> {
    return [...this.pendingByEventId.entries()]
      .filter(
        ([eventId, pending]) =>
          pending.createdAt < olderThan && !excludeEventIds.includes(eventId),
      )
      .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(([eventId, pending]) => ({
        eventId,
        stripeCustomerId: pending.stripeCustomerId,
        createdAt: pending.createdAt,
      }))
      .slice(0, limit);
  }

  snapshot(): PendingStripeCustomerCleanupSnapshot {
    return [...this.pendingByEventId.entries()];
  }

  restore(snapshot: PendingStripeCustomerCleanupSnapshot): void {
    this.pendingByEventId.clear();
    for (const [eventId, pending] of snapshot) {
      this.pendingByEventId.set(eventId, pending);
    }
  }
}
