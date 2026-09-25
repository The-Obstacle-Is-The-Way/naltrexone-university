import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { loadJsonFixture } from './load-json-fixture';

type ClerkEventBody = Omit<ClerkWebhookEvent, 'eventId'>;
type ClerkUserData = Record<string, unknown>;

// The recorded Clerk fixture delivered under the given event id.
export function clerkFixtureEvent(
  name: 'user.updated' | 'user.deleted',
  eventId: string,
): ClerkWebhookEvent {
  return { ...loadJsonFixture<ClerkEventBody>(`clerk/${name}.json`), eventId };
}

// A user.updated delivery in the recorded fixture's shape whose only email
// address is the primary one.
export function clerkUserUpdatedEvent(input: {
  eventId: string;
  clerkUserId: string;
  email: string;
  updatedAt: number;
}): ClerkWebhookEvent {
  const fixture = loadJsonFixture<{ type: string; data: ClerkUserData }>(
    'clerk/user.updated.json',
  );
  return {
    eventId: input.eventId,
    type: fixture.type,
    data: {
      ...fixture.data,
      id: input.clerkUserId,
      primary_email_address_id: 'email_1',
      updated_at: input.updatedAt,
      email_addresses: [{ id: 'email_1', email_address: input.email }],
    },
  };
}

export function clerkUserDeletedEvent(input: {
  eventId: string;
  clerkUserId: string;
}): ClerkWebhookEvent {
  const fixture = loadJsonFixture<{ type: string; data: ClerkUserData }>(
    'clerk/user.deleted.json',
  );
  return {
    eventId: input.eventId,
    type: fixture.type,
    data: { ...fixture.data, id: input.clerkUserId },
  };
}

// A hand-shaped (usually malformed) payload delivered under the given event
// id; it replaces the suites' local `withEventId` shim.
export function clerkEvent(
  eventId: string,
  event: ClerkEventBody,
): ClerkWebhookEvent {
  return { ...event, eventId };
}
