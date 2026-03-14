import type { PendingStripeCancellationRepository } from '@/src/application/ports/repositories';

type PendingStripeCancellationSnapshot = ReadonlyArray<
  readonly [string, string]
>;

export class FakePendingStripeCancellationRepository
  implements PendingStripeCancellationRepository
{
  private readonly pendingByEventId = new Map<string, string>();

  async findByEventId(
    eventId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const stripeCustomerId = this.pendingByEventId.get(eventId);
    if (!stripeCustomerId) return null;
    return { stripeCustomerId };
  }

  async schedule(eventId: string, stripeCustomerId: string): Promise<void> {
    this.pendingByEventId.set(eventId, stripeCustomerId);
  }

  async deleteByEventId(eventId: string): Promise<void> {
    this.pendingByEventId.delete(eventId);
  }

  snapshot(): PendingStripeCancellationSnapshot {
    return [...this.pendingByEventId.entries()];
  }

  restore(snapshot: PendingStripeCancellationSnapshot): void {
    this.pendingByEventId.clear();
    for (const [eventId, stripeCustomerId] of snapshot) {
      this.pendingByEventId.set(eventId, stripeCustomerId);
    }
  }
}
