import { describe, expect, it, vi } from 'vitest';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import {
  FakeStripeCustomerRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';

function createDeps() {
  const cancelCalls: string[] = [];

  return {
    userRepository: new FakeUserRepository(),
    stripeCustomerRepository: new FakeStripeCustomerRepository(),
    cancelCalls,
    cancelStripeCustomerSubscriptions: async (stripeCustomerId: string) => {
      cancelCalls.push(stripeCustomerId);
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('processClerkWebhook', () => {
  it('upserts the user when receiving user.updated with a primary email', async () => {
    const deps = createDeps();

    const event = loadJsonFixture<ClerkWebhookEvent>('clerk/user.updated.json');

    await processClerkWebhook(deps, event);

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'primary@example.com',
    });
  });

  it('ignores user.updated when no email addresses are present', async () => {
    const deps = createDeps();

    await processClerkWebhook(deps, {
      type: 'user.updated',
      data: { id: 'clerk_1', email_addresses: [] },
    });

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('logs a warning when user.updated is missing an email', async () => {
    const deps = createDeps();
    const warn = vi.fn();

    await processClerkWebhook(
      {
        ...deps,
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn,
          error: vi.fn(),
        },
      },
      {
        type: 'user.updated',
        data: { id: 'clerk_1', email_addresses: [] },
      },
    );

    expect(warn).toHaveBeenCalledWith(
      { clerkUserId: 'clerk_1' },
      'Clerk user.updated missing email; skipping user upsert',
    );
  });

  it('ignores user.updated when email_addresses is not an array', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(deps, {
        type: 'user.updated',
        data: { id: 'clerk_1', email_addresses: 'nope' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('uses first email when no primary email is set', async () => {
    const deps = createDeps();

    await processClerkWebhook(deps, {
      type: 'user.updated',
      data: {
        id: 'clerk_1',
        primary_email_address_id: null,
        email_addresses: [
          { id: 'email_1', email_address: 'first@example.com' },
          { id: 'email_2', email_address: 'second@example.com' },
        ],
      },
    });

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'first@example.com',
    });
  });

  it('cancels Stripe subscriptions and deletes the user when receiving user.deleted', async () => {
    const deps = createDeps();
    const user = await deps.userRepository.upsertByClerkId(
      'clerk_1',
      'user@example.com',
    );
    await deps.stripeCustomerRepository.insert(user.id, 'cus_123');

    const event = loadJsonFixture<ClerkWebhookEvent>('clerk/user.deleted.json');
    await processClerkWebhook(deps, event);

    expect(deps.cancelCalls).toEqual(['cus_123']);
    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('does nothing for user.deleted when the user does not exist in the database', async () => {
    const deps = createDeps();

    await processClerkWebhook(deps, {
      type: 'user.deleted',
      data: { id: 'clerk_1' },
    });

    expect(deps.cancelCalls).toEqual([]);
  });

  it('rejects user.updated when the payload is missing email addresses', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(deps, {
        type: 'user.updated',
        data: { id: 'clerk_1' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('rejects user.updated when an email record is missing an email field', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(deps, {
        type: 'user.updated',
        data: { id: 'clerk_1', email_addresses: [{ id: 'email_1' }] },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('rejects user.updated when the payload includes an empty user id', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(deps, {
        type: 'user.updated',
        data: {
          id: '',
          email_addresses: [
            { id: 'email_1', email_address: 'test@example.com' },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Clerk user.updated webhook payload is missing user id',
    });
  });

  it('rejects user.deleted when the payload is invalid', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(deps, {
        type: 'user.deleted',
        data: {},
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Invalid Clerk user.deleted webhook payload',
    });
  });
});
