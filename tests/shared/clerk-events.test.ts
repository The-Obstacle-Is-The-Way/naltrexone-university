import { describe, expect, it } from 'vitest';
import {
  clerkEvent,
  clerkFixtureEvent,
  clerkUserDeletedEvent,
  clerkUserUpdatedEvent,
} from './clerk-events';
import { loadJsonFixture } from './load-json-fixture';

describe('Clerk event builders', () => {
  it.each(['user.updated', 'user.deleted'] as const)(
    'delivers the recorded %s fixture under the given event id',
    (name) => {
      expect(clerkFixtureEvent(name, 'evt_fixture')).toEqual({
        ...loadJsonFixture<object>(`clerk/${name}.json`),
        eventId: 'evt_fixture',
      });
    },
  );

  it('builds a user.updated delivery in the fixture shape with one primary email', () => {
    expect(
      clerkUserUpdatedEvent({
        eventId: 'evt_updated',
        clerkUserId: 'clerk_2',
        email: 'only@example.com',
        updatedAt: 1769904001000,
      }),
    ).toEqual({
      eventId: 'evt_updated',
      type: 'user.updated',
      data: {
        id: 'clerk_2',
        primary_email_address_id: 'email_1',
        updated_at: 1769904001000,
        email_addresses: [{ id: 'email_1', email_address: 'only@example.com' }],
      },
    });
  });

  it('builds a user.deleted delivery for a Clerk user id', () => {
    expect(
      clerkUserDeletedEvent({ eventId: 'evt_deleted', clerkUserId: 'clerk_2' }),
    ).toEqual({
      eventId: 'evt_deleted',
      type: 'user.deleted',
      data: { id: 'clerk_2' },
    });
  });

  it('delivers a hand-shaped payload unchanged under the given event id', () => {
    expect(
      clerkEvent('evt_shaped', { type: 'user.deleted', data: {} }),
    ).toEqual({ eventId: 'evt_shaped', type: 'user.deleted', data: {} });
  });
});
