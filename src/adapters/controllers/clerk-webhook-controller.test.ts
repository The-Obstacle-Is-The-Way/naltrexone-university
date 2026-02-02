import { describe, expect, it, vi } from 'vitest';
import type {
  StripeCustomerRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import { processClerkWebhook } from './clerk-webhook-controller';

function createDeps(overrides?: {
  userRepository?: Partial<UserRepository>;
  stripeCustomerRepository?: Partial<StripeCustomerRepository>;
  cancelStripeCustomerSubscriptions?: (
    stripeCustomerId: string,
  ) => Promise<void>;
}) {
  const userRepository: UserRepository = {
    findByClerkId: vi.fn(async () => null),
    upsertByClerkId: vi.fn(async () => ({
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    })),
    deleteByClerkId: vi.fn(async () => false),
    ...overrides?.userRepository,
  };

  const stripeCustomerRepository: StripeCustomerRepository = {
    findByUserId: vi.fn(async () => null),
    insert: vi.fn(async () => undefined),
    ...overrides?.stripeCustomerRepository,
  };

  const cancelStripeCustomerSubscriptions =
    overrides?.cancelStripeCustomerSubscriptions ??
    vi.fn(async () => undefined);

  return {
    userRepository,
    stripeCustomerRepository,
    cancelStripeCustomerSubscriptions,
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

    expect(deps.userRepository.upsertByClerkId).toHaveBeenCalledWith(
      'clerk_1',
      'primary@example.com',
    );
  });

  it('ignores user.updated when no email addresses are present', async () => {
    const deps = createDeps();

    await processClerkWebhook(deps, {
      type: 'user.updated',
      data: { id: 'clerk_1', email_addresses: [] },
    });

    expect(deps.userRepository.upsertByClerkId).not.toHaveBeenCalled();
  });

  it('cancels Stripe subscriptions and deletes the user when receiving user.deleted', async () => {
    const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);

    const deps = createDeps({
      userRepository: {
        findByClerkId: vi.fn(async () => ({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })),
        deleteByClerkId: vi.fn(async () => true),
      },
      stripeCustomerRepository: {
        findByUserId: vi.fn(async () => ({ stripeCustomerId: 'cus_123' })),
      },
      cancelStripeCustomerSubscriptions,
    });

    await processClerkWebhook(deps, {
      type: 'user.deleted',
      data: { id: 'clerk_1' },
    });

    expect(cancelStripeCustomerSubscriptions).toHaveBeenCalledWith('cus_123');
    expect(deps.userRepository.deleteByClerkId).toHaveBeenCalledWith('clerk_1');
  });

  it('does nothing for user.deleted when the user does not exist in the database', async () => {
    const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);
    const deps = createDeps({ cancelStripeCustomerSubscriptions });

    await processClerkWebhook(deps, {
      type: 'user.deleted',
      data: { id: 'clerk_1' },
    });

    expect(cancelStripeCustomerSubscriptions).not.toHaveBeenCalled();
    expect(deps.userRepository.deleteByClerkId).not.toHaveBeenCalled();
  });
});
