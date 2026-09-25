import { describe, expect, it } from 'vitest';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import {
  FakeStripeCustomerRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import {
  clerkFixtureEvent,
  clerkUserDeletedEvent,
} from '@/tests/shared/clerk-events';
import { createClerkWebhookTestDeps } from './test-helpers/clerk-webhook-controller-harness';

class DeletionBarrierUserRepository extends FakeUserRepository {
  private readonly lockedUserIds = new Set<string>();

  override async lockByClerkId(
    clerkId: string,
  ): Promise<Awaited<ReturnType<FakeUserRepository['findByClerkId']>>> {
    const user = await super.findByClerkId(clerkId);
    if (user) {
      this.lockedUserIds.add(user.id);
    }
    return user;
  }

  isUserLocked(userId: string): boolean {
    return this.lockedUserIds.has(userId);
  }
}

class ConcurrentStripeSyncRepository extends FakeStripeCustomerRepository {
  private readonly raceCustomerId = 'cus_race_after_lookup';

  concurrentInsertAttempts = 0;
  concurrentInsertBlocked = 0;

  constructor(
    private readonly canInsertForUserId: (userId: string) => boolean,
  ) {
    super();
  }

  override async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const existing = await super.findByUserId(userId);
    if (existing) return existing;

    this.concurrentInsertAttempts += 1;

    if (this.canInsertForUserId(userId)) {
      await super.insert(userId, this.raceCustomerId, {
        conflictStrategy: 'authoritative',
      });
    } else {
      this.concurrentInsertBlocked += 1;
    }

    return null;
  }

  async peekStoredMapping(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    return super.findByUserId(userId);
  }
}

class CallOrderUserRepository extends FakeUserRepository {
  readonly deletionCallOrder: string[] = [];

  override async acquireSubscriptionWriteLock(userId: string): Promise<void> {
    this.deletionCallOrder.push(`subscription-lock:${userId}`);
  }

  override async lockByClerkId(
    clerkId: string,
  ): Promise<Awaited<ReturnType<FakeUserRepository['lockByClerkId']>>> {
    this.deletionCallOrder.push(`lock-row:${clerkId}`);
    return super.lockByClerkId(clerkId);
  }

  override async deleteByClerkId(clerkId: string): Promise<boolean> {
    this.deletionCallOrder.push(`delete:${clerkId}`);
    return super.deleteByClerkId(clerkId);
  }
}

class DeleteFailingUserRepository extends FakeUserRepository {
  constructor(private readonly error: unknown) {
    super();
  }

  override async deleteByClerkId(): Promise<boolean> {
    throw this.error;
  }
}

// A local user for `clerkUserId` with a Stripe customer mapping.
async function seedUserWithCustomer(
  deps: ReturnType<typeof createClerkWebhookTestDeps>,
  clerkUserId: string,
  email: string,
  stripeCustomerId: string,
) {
  const user = await deps.userRepository.upsertByClerkId(clerkUserId, email);
  await deps.stripeCustomerRepository.insert(user.id, stripeCustomerId);
  return user;
}

describe('processClerkWebhook user.deleted', () => {
  it('deletes the Stripe customer and local user when receiving user.deleted', async () => {
    const deps = createClerkWebhookTestDeps();
    await seedUserWithCustomer(deps, 'clerk_1', 'user@example.com', 'cus_123');

    await processClerkWebhook(
      deps,
      clerkFixtureEvent('user.deleted', 'evt_fixture_deleted'),
    );

    expect(deps.customerDeleteCalls).toEqual(['cus_123']);
    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('executes the Stripe customer-deletion obligation and clears it on success', async () => {
    const deps = createClerkWebhookTestDeps();
    await seedUserWithCustomer(
      deps,
      'clerk_customer_cleanup',
      'customer-cleanup@example.com',
      'cus_cleanup',
    );

    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_customer_cleanup',
        clerkUserId: 'clerk_customer_cleanup',
      }),
    );

    expect(deps.customerDeleteCalls).toEqual(['cus_cleanup']);
    await expect(
      deps.pendingStripeCustomerCleanups.findByEventId('evt_customer_cleanup'),
    ).resolves.toBeNull();
    await expect(
      deps.clerkEvents.peek('evt_customer_cleanup'),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('retains the customer-deletion obligation when Stripe cleanup fails', async () => {
    const cleanupError = new Error('customer delete failed');
    const deps = {
      ...createClerkWebhookTestDeps(),
      deleteStripeCustomer: async () => {
        throw cleanupError;
      },
    };
    await seedUserWithCustomer(
      deps,
      'clerk_customer_cleanup_failure',
      'customer-cleanup-failure@example.com',
      'cus_cleanup_failure',
    );

    await expect(
      processClerkWebhook(
        deps,
        clerkUserDeletedEvent({
          eventId: 'evt_customer_cleanup_failure',
          clerkUserId: 'clerk_customer_cleanup_failure',
        }),
      ),
    ).rejects.toBe(cleanupError);

    await expect(
      deps.pendingStripeCustomerCleanups.findByEventId(
        'evt_customer_cleanup_failure',
      ),
    ).resolves.toEqual({ stripeCustomerId: 'cus_cleanup_failure' });
    const storedEvent = await deps.clerkEvents.peek(
      'evt_customer_cleanup_failure',
    );
    expect(storedEvent).toMatchObject({
      processedAt: null,
      error: expect.any(String),
    });
    expect(JSON.parse(storedEvent?.error ?? '{}')).toEqual({ name: 'Error' });
    expect(storedEvent?.error).not.toContain('customer delete failed');
  });

  it('acquires the subscription writer lock before the users-row lock and delete', async () => {
    const userRepository = new CallOrderUserRepository();
    const deps = createClerkWebhookTestDeps({ userRepository });
    const user = await userRepository.upsertByClerkId(
      'clerk_lock_order',
      'lock-order@example.com',
    );

    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_user_deleted_lock_order',
        clerkUserId: 'clerk_lock_order',
      }),
    );

    // Advisory before any users-row lock: subscription writers hold the
    // advisory while their INSERTs take FK share locks on the users row, so
    // the inverse acquisition order here would form an AB-BA cycle (BUG-294).
    expect(userRepository.deletionCallOrder).toEqual([
      `subscription-lock:${user.id}`,
      'lock-row:clerk_lock_order',
      'delete:clerk_lock_order',
    ]);
  });

  it('does not delete the Stripe customer when local user deletion fails', async () => {
    const deleteError = new Error('delete failed');
    const deps = createClerkWebhookTestDeps({
      userRepository: new DeleteFailingUserRepository(deleteError),
    });
    await seedUserWithCustomer(
      deps,
      'clerk_delete_failure',
      'delete-failure@example.com',
      'cus_delete_failure',
    );

    await expect(
      processClerkWebhook(
        deps,
        clerkUserDeletedEvent({
          eventId: 'evt_user_deleted_delete_failure',
          clerkUserId: 'clerk_delete_failure',
        }),
      ),
    ).rejects.toBe(deleteError);

    expect(deps.customerDeleteCalls).toEqual([]);
    await expect(
      deps.userRepository.findByClerkId('clerk_delete_failure'),
    ).resolves.toMatchObject({ email: 'delete-failure@example.com' });
    await expect(
      deps.deletedClerkUsers.exists('clerk_delete_failure'),
    ).resolves.toBe(false);
  });

  it('does nothing for user.deleted when the user does not exist in the database', async () => {
    const deps = createClerkWebhookTestDeps();

    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_user_deleted_missing_local_user',
        clerkUserId: 'clerk_1',
      }),
    );

    expect(deps.customerDeleteCalls).toEqual([]);
  });

  it('still deletes a stray local user when a tombstone already exists', async () => {
    const deps = createClerkWebhookTestDeps();
    await deps.deletedClerkUsers.markDeleted('clerk_stray');
    await seedUserWithCustomer(
      deps,
      'clerk_stray',
      'stray@example.com',
      'cus_stray',
    );

    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_user_deleted_stray_after_tombstone',
        clerkUserId: 'clerk_stray',
      }),
    );

    expect(deps.customerDeleteCalls).toEqual(['cus_stray']);
    await expect(
      deps.userRepository.findByClerkId('clerk_stray'),
    ).resolves.toBeNull();
  });

  it('keeps the local delete committed when post-commit Stripe customer deletion fails', async () => {
    const deps = createClerkWebhookTestDeps();
    await seedUserWithCustomer(
      deps,
      'clerk_post_commit_cancel',
      'post-commit@example.com',
      'cus_post_commit',
    );

    let shouldFailCustomerDelete = true;
    deps.deleteStripeCustomer = async () => {
      if (shouldFailCustomerDelete) {
        throw new Error('stripe customer delete failed');
      }
    };

    const event = clerkUserDeletedEvent({
      eventId: 'evt_user_deleted_post_commit_cancel',
      clerkUserId: 'clerk_post_commit_cancel',
    });

    await expect(processClerkWebhook(deps, event)).rejects.toThrow(
      'stripe customer delete failed',
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_post_commit_cancel'),
    ).resolves.toBeNull();
    await expect(
      deps.deletedClerkUsers.exists('clerk_post_commit_cancel'),
    ).resolves.toBe(true);

    shouldFailCustomerDelete = false;
    await expect(processClerkWebhook(deps, event)).resolves.toBeUndefined();
  });

  it('prevents a Stripe mapping from appearing after user.deleted has already checked for one', async () => {
    const userRepository = new DeletionBarrierUserRepository();
    const stripeCustomerRepository = new ConcurrentStripeSyncRepository(
      (userId) => !userRepository.isUserLocked(userId),
    );
    const deps = createClerkWebhookTestDeps({
      userRepository,
      stripeCustomerRepository,
    });
    const user = await userRepository.upsertByClerkId(
      'clerk_race',
      'race@example.com',
    );

    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_user_deleted_race',
        clerkUserId: 'clerk_race',
      }),
    );

    expect(stripeCustomerRepository.concurrentInsertAttempts).toBe(1);
    expect(stripeCustomerRepository.concurrentInsertBlocked).toBe(1);
    expect(deps.customerDeleteCalls).toEqual([]);
    await expect(
      stripeCustomerRepository.peekStoredMapping(user.id),
    ).resolves.toBeNull();
    await expect(
      userRepository.findByClerkId('clerk_race'),
    ).resolves.toBeNull();
  });
});
