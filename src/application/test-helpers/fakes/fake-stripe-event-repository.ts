import { ApplicationError } from '@/src/application/errors';
import type { StripeEventRepository } from '@/src/application/ports/repositories';

type StoredStripeEvent = {
  type: string;
  processedAt: Date | null;
  error: string | null;
};

export class FakeStripeEventRepository implements StripeEventRepository {
  private readonly events = new Map<string, StoredStripeEvent>();

  async claim(eventId: string, type: string): Promise<boolean> {
    if (this.events.has(eventId)) {
      return false;
    }

    this.events.set(eventId, {
      type,
      processedAt: null,
      error: null,
    });
    return true;
  }

  async peek(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null } | null> {
    const event = this.events.get(eventId);
    if (!event) return null;
    return { processedAt: event.processedAt, error: event.error };
  }

  async lock(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null }> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
    return { processedAt: event.processedAt, error: event.error };
  }

  async markProcessed(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
    event.processedAt = new Date();
    event.error = null;
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
    event.processedAt = null;
    event.error = error;
  }

  async pruneProcessedBefore(cutoff: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) return 0;

    const toDelete = [...this.events.entries()]
      .filter(([, event]) => event.processedAt && event.processedAt < cutoff)
      .sort((a, b) => {
        const aTime = a[1].processedAt?.getTime() ?? 0;
        const bTime = b[1].processedAt?.getTime() ?? 0;
        return aTime - bTime;
      })
      .slice(0, limit);

    for (const [eventId] of toDelete) {
      this.events.delete(eventId);
    }

    return toDelete.length;
  }
}
