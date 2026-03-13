import { ApplicationError } from '@/src/application/errors';
import type { ClerkEventRepository } from '@/src/application/ports/repositories';

type StoredClerkEvent = {
  type: string;
  processedAt: Date | null;
  error: string | null;
};

type ClerkEventSnapshot = ReadonlyArray<readonly [string, StoredClerkEvent]>;

function cloneStoredClerkEvent(event: StoredClerkEvent): StoredClerkEvent {
  return {
    type: event.type,
    processedAt: event.processedAt ? new Date(event.processedAt) : null,
    error: event.error,
  };
}

export class FakeClerkEventRepository implements ClerkEventRepository {
  private readonly events = new Map<string, StoredClerkEvent>();

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
      throw new ApplicationError('NOT_FOUND', 'Clerk event not found');
    }

    return { processedAt: event.processedAt, error: event.error };
  }

  async markProcessed(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'Clerk event not found');
    }

    event.processedAt = new Date();
    event.error = null;
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'Clerk event not found');
    }

    event.processedAt = null;
    event.error = error;
  }

  snapshot(): ClerkEventSnapshot {
    return [...this.events.entries()].map(([eventId, event]) => [
      eventId,
      cloneStoredClerkEvent(event),
    ]);
  }

  restore(snapshot: ClerkEventSnapshot): void {
    this.events.clear();
    for (const [eventId, event] of snapshot) {
      this.events.set(eventId, cloneStoredClerkEvent(event));
    }
  }
}
