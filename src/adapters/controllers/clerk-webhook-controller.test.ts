import { describe, expect, it } from 'vitest';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import {
  clerkEvent,
  clerkFixtureEvent,
  clerkUserUpdatedEvent,
} from '@/tests/shared/clerk-events';
import { createClerkWebhookTestDeps } from './test-helpers/clerk-webhook-controller-harness';

// clerk_incoming's delivery claims the email clerk_owner already holds.
function incomingClaimsHeldEmail(eventId: string) {
  return clerkUserUpdatedEvent({
    eventId,
    clerkUserId: 'clerk_incoming',
    email: 'held@example.com',
    updatedAt: 1769904003000,
  });
}

// Clerk's current record for clerk_owner, which has moved to a new email.
const ownerMovedToNewEmail = {
  id: 'clerk_owner',
  updatedAt: 1769904004000,
  emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
};

async function seedOwnerHoldingEmail(
  deps: ReturnType<typeof createClerkWebhookTestDeps>,
) {
  return deps.userRepository.upsertByClerkId(
    'clerk_owner',
    'held@example.com',
    { observedAt: new Date('2026-02-01T00:00:00Z') },
  );
}

describe('processClerkWebhook user.updated', () => {
  it('upserts the user when receiving user.updated with a primary email', async () => {
    const deps = createClerkWebhookTestDeps();

    await processClerkWebhook(
      deps,
      clerkFixtureEvent('user.updated', 'evt_fixture_updated'),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'primary@example.com',
    });
  });

  it('returns the newer email when an older user.updated event is received', async () => {
    const deps = createClerkWebhookTestDeps();

    await processClerkWebhook(
      deps,
      clerkUserUpdatedEvent({
        eventId: 'evt_user_updated_newer',
        clerkUserId: 'clerk_1',
        email: 'new@example.com',
        updatedAt: 1769904001000,
      }),
    );
    await processClerkWebhook(
      deps,
      clerkUserUpdatedEvent({
        eventId: 'evt_user_updated_older',
        clerkUserId: 'clerk_1',
        email: 'old@example.com',
        updatedAt: 1769904000000,
      }),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'new@example.com',
    });
  });

  it('fails closed without mutating either row when a tx-bound update claims another identity email', async () => {
    const baseDeps = createClerkWebhookTestDeps();
    const originalOwner = await seedOwnerHoldingEmail(baseDeps);
    const incomingOwner = await baseDeps.userRepository.upsertByClerkId(
      'clerk_incoming',
      'incoming@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const deps = {
      ...baseDeps,
      getClerkUserById: async () => ownerMovedToNewEmail,
    };

    await expect(
      processClerkWebhook(
        deps,
        incomingClaimsHeldEmail('evt_user_updated_email_owner_conflict'),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      existingClerkUserId: 'clerk_owner',
      details: {
        reason: 'user_email_owned_by_another_identity',
      },
    });
    await expect(
      deps.userRepository.findByClerkId('clerk_owner'),
    ).resolves.toEqual(originalOwner);
    await expect(
      deps.userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toEqual(incomingOwner);
    expect(deps.logger.warnCalls).toContainEqual({
      context: {
        existingClerkUserId: 'clerk_owner',
        incomingClerkUserId: 'clerk_incoming',
        resolution: 'blocked_incoming_identity_already_exists',
      },
      msg: 'Blocked Clerk user email ownership conflict',
    });
  });

  it('releases the webhook transaction before resolving an email ownership conflict through Clerk', async () => {
    const baseDeps = createClerkWebhookTestDeps();
    await seedOwnerHoldingEmail(baseDeps);
    let transactionDepth = 0;
    let lookupTransactionDepth: number | null = null;
    const deps = {
      ...baseDeps,
      transaction: async <T>(
        fn: Parameters<typeof baseDeps.transaction<T>>[0],
      ): Promise<T> => {
        transactionDepth += 1;
        try {
          return await baseDeps.transaction(fn);
        } finally {
          transactionDepth -= 1;
        }
      },
      getClerkUserById: async () => {
        lookupTransactionDepth = transactionDepth;
        return ownerMovedToNewEmail;
      },
    };

    await processClerkWebhook(
      deps,
      incomingClaimsHeldEmail('evt_user_updated_resolve_outside_transaction'),
    );

    expect(lookupTransactionDepth).toBe(0);
    expect(baseDeps.transactions.count).toBe(2);
    await expect(
      deps.userRepository.findByClerkId('clerk_owner'),
    ).resolves.toMatchObject({ email: 'owner-new@example.com' });
    await expect(
      deps.userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toMatchObject({ email: 'held@example.com' });
  });

  it('does not apply a resolved email ownership conflict after another worker processes the event', async () => {
    const baseDeps = createClerkWebhookTestDeps();
    const originalOwner = await seedOwnerHoldingEmail(baseDeps);
    const eventId = 'evt_user_updated_processed_during_resolution';
    const deps = {
      ...baseDeps,
      getClerkUserById: async () => {
        await baseDeps.clerkEvents.markProcessed(eventId);
        return ownerMovedToNewEmail;
      },
    };

    await processClerkWebhook(deps, incomingClaimsHeldEmail(eventId));

    await expect(
      deps.userRepository.findByClerkId('clerk_owner'),
    ).resolves.toEqual(originalOwner);
    await expect(
      deps.userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toBeNull();
    expect(deps.logger.infoCalls).toContainEqual({
      context: {
        existingClerkUserId: 'clerk_owner',
        incomingClerkUserId: 'clerk_incoming',
        resolution: 'identity_resolution_superseded_by_processed_event',
      },
      msg: 'Skipped Clerk user email ownership resolution',
    });
  });

  it('does not apply a resolved email ownership conflict after the incoming identity is deleted', async () => {
    const baseDeps = createClerkWebhookTestDeps();
    const originalOwner = await seedOwnerHoldingEmail(baseDeps);
    const eventId = 'evt_user_updated_deleted_during_resolution';
    const deps = {
      ...baseDeps,
      getClerkUserById: async () => {
        await baseDeps.deletedClerkUsers.markDeleted('clerk_incoming');
        return ownerMovedToNewEmail;
      },
    };

    await processClerkWebhook(deps, incomingClaimsHeldEmail(eventId));

    await expect(
      deps.userRepository.findByClerkId('clerk_owner'),
    ).resolves.toEqual(originalOwner);
    await expect(
      deps.userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toBeNull();
    await expect(baseDeps.clerkEvents.peek(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
    expect(deps.logger.infoCalls).toContainEqual({
      context: {
        existingClerkUserId: 'clerk_owner',
        incomingClerkUserId: 'clerk_incoming',
        resolution: 'identity_resolution_blocked_by_deletion_tombstone',
      },
      msg: 'Skipped Clerk user email ownership resolution',
    });
  });

  it('ignores user.updated when no email addresses are present', async () => {
    const deps = createClerkWebhookTestDeps();

    await processClerkWebhook(
      deps,
      clerkEvent('evt_user_updated_missing_email_addresses', {
        type: 'user.updated',
        data: { id: 'clerk_1', updated_at: 1769904000000, email_addresses: [] },
      }),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('logs a warning when user.updated is missing an email', async () => {
    const deps = createClerkWebhookTestDeps();

    await processClerkWebhook(
      deps,
      clerkEvent('evt_user_updated_warn_missing_email', {
        type: 'user.updated',
        data: { id: 'clerk_1', updated_at: 1769904000000, email_addresses: [] },
      }),
    );

    expect(deps.logger.warnCalls).toContainEqual({
      context: { clerkUserId: 'clerk_1' },
      msg: 'Clerk user.updated missing email; skipping user upsert',
    });
  });

  it('ignores user.updated when email_addresses is not an array', async () => {
    const deps = createClerkWebhookTestDeps();

    await expect(
      processClerkWebhook(
        deps,
        clerkEvent('evt_user_updated_invalid_email_addresses', {
          type: 'user.updated',
          data: {
            id: 'clerk_1',
            updated_at: 1769904000000,
            email_addresses: 'nope',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('uses first email when no primary email is set', async () => {
    const deps = createClerkWebhookTestDeps();

    await processClerkWebhook(
      deps,
      clerkEvent('evt_user_updated_no_primary_email', {
        type: 'user.updated',
        data: {
          id: 'clerk_1',
          primary_email_address_id: null,
          updated_at: 1769904000000,
          email_addresses: [
            { id: 'email_1', email_address: 'first@example.com' },
            { id: 'email_2', email_address: 'second@example.com' },
          ],
        },
      }),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'first@example.com',
    });
  });

  it('rejects user.updated when the payload is missing email addresses', async () => {
    const deps = createClerkWebhookTestDeps();

    await expect(
      processClerkWebhook(
        deps,
        clerkEvent('evt_user_updated_missing_email_array', {
          type: 'user.updated',
          data: { id: 'clerk_1', updated_at: 1769904000000 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('rejects user.updated when an email record is missing an email field', async () => {
    const deps = createClerkWebhookTestDeps();

    await expect(
      processClerkWebhook(
        deps,
        clerkEvent('evt_user_updated_missing_email_field', {
          type: 'user.updated',
          data: {
            id: 'clerk_1',
            updated_at: 1769904000000,
            email_addresses: [{ id: 'email_1' }],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('rejects user.updated when the payload includes an empty user id', async () => {
    const deps = createClerkWebhookTestDeps();

    await expect(
      processClerkWebhook(
        deps,
        clerkEvent('evt_user_updated_empty_user_id', {
          type: 'user.updated',
          data: {
            id: '',
            updated_at: 1769904000000,
            email_addresses: [
              { id: 'email_1', email_address: 'test@example.com' },
            ],
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Clerk user.updated webhook payload is missing user id',
    });
  });

  it('rejects user.deleted when the payload is invalid', async () => {
    const deps = createClerkWebhookTestDeps();

    await expect(
      processClerkWebhook(
        deps,
        clerkEvent('evt_user_deleted_invalid_payload', {
          type: 'user.deleted',
          data: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Invalid Clerk user.deleted webhook payload',
    });
  });

  it('rejects user.deleted when the payload includes an empty user id', async () => {
    const deps = createClerkWebhookTestDeps();

    await expect(
      processClerkWebhook(
        deps,
        clerkEvent('evt_user_deleted_empty_user_id', {
          type: 'user.deleted',
          data: { id: '' },
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Clerk user.deleted webhook payload is missing user id',
    });
  });
});
