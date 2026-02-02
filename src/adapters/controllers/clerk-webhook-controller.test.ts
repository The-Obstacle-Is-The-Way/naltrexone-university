import { describe, expect, it, vi } from 'vitest';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import {
  FakeStripeCustomerRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';

function createDeps() {
  return {
    userRepository: new FakeUserRepository(),
    stripeCustomerRepository: new FakeStripeCustomerRepository(),
    cancelStripeCustomerSubscriptions: vi.fn(async () => undefined),
  };
}

describe('processClerkWebhook', () => {
  it('upserts the user when receiving user.updated with a primary email', async () => {
    const deps = createDeps();

    await processClerkWebhook(deps, {
      type: 'user.updated',
      data: {
        id: 'clerk_1',
        primary_email_address_id: 'email_2',
        email_addresses: [
          { id: 'email_1', email_address: 'secondary@example.com' },
          { id: 'email_2', email_address: 'primary@example.com' },
        ],
      },
    });

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

  it('ignores user.updated when email_addresses is not an array', async () => {
    const deps = createDeps();

    await processClerkWebhook(deps, {
      type: 'user.updated',
      data: { id: 'clerk_1', email_addresses: 'nope' },
    });

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

    await processClerkWebhook(deps, {
      type: 'user.deleted',
      data: { id: 'clerk_1' },
    });

    expect(deps.cancelStripeCustomerSubscriptions).toHaveBeenCalledWith(
      'cus_123',
    );
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

    expect(deps.cancelStripeCustomerSubscriptions).not.toHaveBeenCalled();
  });
});
