// biome-ignore lint/style/noExcessiveLinesPerFile: Keep Clerk event normalization, idempotency, and deletion workflows together — split tracked by DEBT-469.
import { describe, expect, it } from 'vitest';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeClerkEventRepository,
  FakeDeletedClerkUserRepository,
  FakeLogger,
  FakePendingStripeCustomerCleanupRepository,
  FakeStripeCustomerRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';

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

class TombstoneDuringUpsertUserRepository extends FakeUserRepository {
  private shouldSimulateDelete = false;
  readonly deletionCallOrder: string[] = [];
  lastUpsertedUserId: string | null = null;

  constructor(
    private readonly deletedClerkUsers: FakeDeletedClerkUserRepository,
  ) {
    super();
  }

  async seedUser(clerkId: string, email: string) {
    return super.upsertByClerkId(clerkId, email);
  }

  armConcurrentDelete() {
    this.shouldSimulateDelete = true;
  }

  override async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: Parameters<FakeUserRepository['upsertByClerkId']>[2],
  ) {
    if (this.shouldSimulateDelete) {
      this.shouldSimulateDelete = false;
      await super.deleteByClerkId(clerkId);
      await this.deletedClerkUsers.markDeleted(clerkId);
    }

    const user = await super.upsertByClerkId(clerkId, email, options);
    this.lastUpsertedUserId = user.id;
    return user;
  }

  override async acquireSubscriptionWriteLock(userId: string): Promise<void> {
    this.deletionCallOrder.push(`subscription-lock:${userId}`);
  }

  override async deleteByClerkId(clerkId: string): Promise<boolean> {
    this.deletionCallOrder.push(`delete:${clerkId}`);
    return super.deleteByClerkId(clerkId);
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

class ThrowingUserRepository extends FakeUserRepository {
  constructor(private readonly error: unknown) {
    super();
  }

  override async upsertByClerkId(): Promise<never> {
    throw this.error;
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

function createDeferred() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: () => {
      if (!resolve) {
        throw new Error('Deferred promise has not been initialized');
      }
      resolve();
    },
  };
}

class TransactionalUserStore {
  private readonly committedUsers = new Map<
    string,
    Awaited<ReturnType<FakeUserRepository['upsertByClerkId']>>
  >();
  private nextId = 1;

  constructor(private readonly pauseUpdateAfterUpsert?: () => Promise<void>) {}

  createRepository(label: 'update' | 'delete') {
    const stagedUsers = new Map<
      string,
      Awaited<ReturnType<FakeUserRepository['upsertByClerkId']>>
    >();
    const stagedDeletes = new Set<string>();

    const readVisibleUser = (clerkId: string) => {
      if (stagedDeletes.has(clerkId)) return null;
      return (
        stagedUsers.get(clerkId) ?? this.committedUsers.get(clerkId) ?? null
      );
    };

    return {
      findById: async (id: string) => {
        const clerkIds = new Set([
          ...this.committedUsers.keys(),
          ...stagedUsers.keys(),
        ]);
        for (const clerkId of clerkIds) {
          const user = readVisibleUser(clerkId);
          if (user?.id === id) return user;
        }
        return null;
      },
      findByClerkId: async (clerkId: string) => readVisibleUser(clerkId),
      lockByClerkId: async (clerkId: string) => readVisibleUser(clerkId),
      acquireSubscriptionWriteLock: async () => undefined,
      upsertByClerkId: async (
        clerkId: string,
        email: string,
        options?: Parameters<FakeUserRepository['upsertByClerkId']>[2],
      ) => {
        const observedAt = options?.observedAt ?? new Date();
        const existing = readVisibleUser(clerkId);
        const user =
          existing === null
            ? {
                id: `tx-user-${this.nextId++}`,
                email,
                createdAt: observedAt,
                updatedAt: observedAt,
              }
            : {
                ...existing,
                email,
                updatedAt: observedAt,
              };

        stagedDeletes.delete(clerkId);
        stagedUsers.set(clerkId, user);

        if (label === 'update' && this.pauseUpdateAfterUpsert) {
          await this.pauseUpdateAfterUpsert();
        }

        return user;
      },
      updateEmailByClerkId: async (
        clerkId: string,
        email: string,
        options?: Parameters<FakeUserRepository['upsertByClerkId']>[2],
      ) => {
        const existing = readVisibleUser(clerkId);
        if (!existing) return null;

        const observedAt = options?.observedAt ?? new Date();
        const user =
          existing.updatedAt >= observedAt
            ? existing
            : { ...existing, email, updatedAt: observedAt };
        stagedUsers.set(clerkId, user);
        return user;
      },
      deleteByClerkId: async (clerkId: string) => {
        const existing = readVisibleUser(clerkId);
        if (!existing) return false;
        stagedUsers.delete(clerkId);
        stagedDeletes.add(clerkId);
        return true;
      },
      commit: () => {
        for (const clerkId of stagedDeletes) {
          this.committedUsers.delete(clerkId);
        }

        for (const [clerkId, user] of stagedUsers) {
          this.committedUsers.set(clerkId, user);
        }
      },
    };
  }

  async findCommittedUser(clerkId: string) {
    return this.committedUsers.get(clerkId) ?? null;
  }
}

class TransactionalDeletedClerkUserStore {
  private readonly committedDeletedUsers = new Map<string, Date>();
  private readonly pendingLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly pauseDeleteBeforeTombstone?: () => Promise<void>,
  ) {}

  createRepository(label: 'update' | 'delete') {
    const stagedDeletedUsers = new Map<string, Date>();
    const heldLocks: Array<() => void> = [];

    const readExists = (clerkId: string) =>
      stagedDeletedUsers.has(clerkId) ||
      this.committedDeletedUsers.has(clerkId);

    return {
      lock: async (clerkId: string) => {
        const previous = this.pendingLocks.get(clerkId) ?? Promise.resolve();
        let release: (() => void) | null = null;
        const current = new Promise<void>((resolve) => {
          release = resolve;
        });

        this.pendingLocks.set(
          clerkId,
          previous.then(() => current),
        );
        await previous;
        heldLocks.push(() => {
          if (!release) {
            throw new Error('Lock release has not been initialized');
          }
          release();
          if (this.pendingLocks.get(clerkId) === current) {
            this.pendingLocks.delete(clerkId);
          }
        });
      },
      exists: async (clerkId: string) => readExists(clerkId),
      markDeleted: async (clerkId: string, deletedAt?: Date) => {
        if (label === 'delete' && this.pauseDeleteBeforeTombstone) {
          await this.pauseDeleteBeforeTombstone();
        }

        if (!readExists(clerkId)) {
          stagedDeletedUsers.set(clerkId, deletedAt ?? new Date());
        }
      },
      commit: () => {
        for (const [clerkId, deletedAt] of stagedDeletedUsers) {
          this.committedDeletedUsers.set(clerkId, deletedAt);
        }

        while (heldLocks.length > 0) {
          heldLocks.pop()?.();
        }
      },
    };
  }

  async exists(clerkId: string) {
    return this.committedDeletedUsers.has(clerkId);
  }
}

function withEventId(
  event: Omit<ClerkWebhookEvent, 'eventId'>,
  eventId: string,
): ClerkWebhookEvent {
  const eventWithId = {
    ...event,
    eventId,
  } satisfies ClerkWebhookEvent;

  return eventWithId;
}

function createDeps(userRepository = new FakeUserRepository()) {
  const customerDeleteCalls: string[] = [];
  const logger = new FakeLogger();
  const clerkEvents = new FakeClerkEventRepository();
  const deletedClerkUsers = new FakeDeletedClerkUserRepository();
  const pendingStripeCustomerCleanups =
    new FakePendingStripeCustomerCleanupRepository();
  const stripeCustomerRepository = new FakeStripeCustomerRepository();

  return {
    clerkEvents,
    deletedClerkUsers,
    pendingStripeCustomerCleanups,
    userRepository,
    stripeCustomerRepository,
    transaction: async <T>(
      fn: (tx: {
        clerkEvents: FakeClerkEventRepository;
        deletedClerkUsers: FakeDeletedClerkUserRepository;
        pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
        userRepository: FakeUserRepository;
        stripeCustomerRepository: FakeStripeCustomerRepository;
      }) => Promise<T>,
    ) =>
      fn({
        clerkEvents,
        deletedClerkUsers,
        pendingStripeCustomerCleanups,
        userRepository,
        stripeCustomerRepository,
      }),
    customerDeleteCalls,
    deleteStripeCustomer: async (stripeCustomerId: string) => {
      customerDeleteCalls.push(stripeCustomerId);
    },
    getClerkUserById: async () => null,
    logger,
  };
}

describe('processClerkWebhook', () => {
  it('upserts the user when receiving user.updated with a primary email', async () => {
    const deps = createDeps();

    const event = withEventId(
      loadJsonFixture<Omit<ClerkWebhookEvent, 'eventId'>>(
        'clerk/user.updated.json',
      ),
      'evt_fixture_updated',
    );

    await processClerkWebhook(deps, event);

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'primary@example.com',
    });
  });

  it('returns the newer email when an older user.updated event is received', async () => {
    const deps = createDeps();

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_1',
            primary_email_address_id: 'email_1',
            updated_at: 1769904001000,
            email_addresses: [
              { id: 'email_1', email_address: 'new@example.com' },
            ],
          },
        },
        'evt_user_updated_newer',
      ),
    );

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_1',
            primary_email_address_id: 'email_1',
            updated_at: 1769904000000,
            email_addresses: [
              { id: 'email_1', email_address: 'old@example.com' },
            ],
          },
        },
        'evt_user_updated_older',
      ),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'new@example.com',
    });
  });

  it('fails closed without mutating either row when a tx-bound update claims another identity email', async () => {
    const baseDeps = createDeps();
    const originalOwner = await baseDeps.userRepository.upsertByClerkId(
      'clerk_owner',
      'held@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const incomingOwner = await baseDeps.userRepository.upsertByClerkId(
      'clerk_incoming',
      'incoming@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const deps = {
      ...baseDeps,
      getClerkUserById: async () => ({
        id: 'clerk_owner',
        updatedAt: 1769904004000,
        emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
      }),
    };

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: {
              id: 'clerk_incoming',
              primary_email_address_id: 'email_1',
              updated_at: 1769904003000,
              email_addresses: [
                { id: 'email_1', email_address: 'held@example.com' },
              ],
            },
          },
          'evt_user_updated_email_owner_conflict',
        ),
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
    const baseDeps = createDeps();
    await baseDeps.userRepository.upsertByClerkId(
      'clerk_owner',
      'held@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    let transactionDepth = 0;
    let transactionCount = 0;
    let lookupTransactionDepth: number | null = null;
    const deps = {
      ...baseDeps,
      transaction: async <T>(
        fn: Parameters<typeof baseDeps.transaction<T>>[0],
      ): Promise<T> => {
        transactionCount += 1;
        transactionDepth += 1;
        try {
          return await baseDeps.transaction(fn);
        } finally {
          transactionDepth -= 1;
        }
      },
      getClerkUserById: async () => {
        lookupTransactionDepth = transactionDepth;
        return {
          id: 'clerk_owner',
          updatedAt: 1769904004000,
          emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
        };
      },
    };

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_incoming',
            primary_email_address_id: 'email_1',
            updated_at: 1769904003000,
            email_addresses: [
              { id: 'email_1', email_address: 'held@example.com' },
            ],
          },
        },
        'evt_user_updated_resolve_outside_transaction',
      ),
    );

    expect(lookupTransactionDepth).toBe(0);
    expect(transactionCount).toBe(2);
    await expect(
      deps.userRepository.findByClerkId('clerk_owner'),
    ).resolves.toMatchObject({ email: 'owner-new@example.com' });
    await expect(
      deps.userRepository.findByClerkId('clerk_incoming'),
    ).resolves.toMatchObject({ email: 'held@example.com' });
  });

  it('does not apply a resolved email ownership conflict after another worker processes the event', async () => {
    const baseDeps = createDeps();
    const originalOwner = await baseDeps.userRepository.upsertByClerkId(
      'clerk_owner',
      'held@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const eventId = 'evt_user_updated_processed_during_resolution';
    const deps = {
      ...baseDeps,
      getClerkUserById: async () => {
        await baseDeps.clerkEvents.markProcessed(eventId);
        return {
          id: 'clerk_owner',
          updatedAt: 1769904004000,
          emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
        };
      },
    };

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_incoming',
            primary_email_address_id: 'email_1',
            updated_at: 1769904003000,
            email_addresses: [
              { id: 'email_1', email_address: 'held@example.com' },
            ],
          },
        },
        eventId,
      ),
    );

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
    const baseDeps = createDeps();
    const originalOwner = await baseDeps.userRepository.upsertByClerkId(
      'clerk_owner',
      'held@example.com',
      { observedAt: new Date('2026-02-01T00:00:00Z') },
    );
    const eventId = 'evt_user_updated_deleted_during_resolution';
    const deps = {
      ...baseDeps,
      getClerkUserById: async () => {
        await baseDeps.deletedClerkUsers.markDeleted('clerk_incoming');
        return {
          id: 'clerk_owner',
          updatedAt: 1769904004000,
          emailAddresses: [{ emailAddress: 'owner-new@example.com' }],
        };
      },
    };

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_incoming',
            primary_email_address_id: 'email_1',
            updated_at: 1769904003000,
            email_addresses: [
              { id: 'email_1', email_address: 'held@example.com' },
            ],
          },
        },
        eventId,
      ),
    );

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
    const deps = createDeps();

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_1',
            updated_at: 1769904000000,
            email_addresses: [],
          },
        },
        'evt_user_updated_missing_email_addresses',
      ),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('logs a warning when user.updated is missing an email', async () => {
    const deps = createDeps();

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_1',
            updated_at: 1769904000000,
            email_addresses: [],
          },
        },
        'evt_user_updated_warn_missing_email',
      ),
    );

    expect(deps.logger.warnCalls).toContainEqual({
      context: { clerkUserId: 'clerk_1' },
      msg: 'Clerk user.updated missing email; skipping user upsert',
    });
  });

  it('ignores user.updated when email_addresses is not an array', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: {
              id: 'clerk_1',
              updated_at: 1769904000000,
              email_addresses: 'nope',
            },
          },
          'evt_user_updated_invalid_email_addresses',
        ),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('uses first email when no primary email is set', async () => {
    const deps = createDeps();

    await processClerkWebhook(
      deps,
      withEventId(
        {
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
        },
        'evt_user_updated_no_primary_email',
      ),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toMatchObject({
      email: 'first@example.com',
    });
  });

  it('deletes the Stripe customer and local user when receiving user.deleted', async () => {
    const deps = createDeps();
    const user = await deps.userRepository.upsertByClerkId(
      'clerk_1',
      'user@example.com',
    );
    await deps.stripeCustomerRepository.insert(user.id, 'cus_123');

    const event = withEventId(
      loadJsonFixture<Omit<ClerkWebhookEvent, 'eventId'>>(
        'clerk/user.deleted.json',
      ),
      'evt_fixture_deleted',
    );
    await processClerkWebhook(deps, event);

    expect(deps.customerDeleteCalls).toEqual(['cus_123']);
    await expect(
      deps.userRepository.findByClerkId('clerk_1'),
    ).resolves.toBeNull();
  });

  it('executes the Stripe customer-deletion obligation and clears it on success', async () => {
    const deleteCustomerCalls: string[] = [];
    const deps = {
      ...createDeps(),
      deleteStripeCustomer: async (stripeCustomerId: string) => {
        deleteCustomerCalls.push(stripeCustomerId);
      },
    };
    const user = await deps.userRepository.upsertByClerkId(
      'clerk_customer_cleanup',
      'customer-cleanup@example.com',
    );
    await deps.stripeCustomerRepository.insert(user.id, 'cus_cleanup');

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_customer_cleanup' },
        },
        'evt_customer_cleanup',
      ),
    );

    expect(deleteCustomerCalls).toEqual(['cus_cleanup']);
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
      ...createDeps(),
      deleteStripeCustomer: async () => {
        throw cleanupError;
      },
    };
    const user = await deps.userRepository.upsertByClerkId(
      'clerk_customer_cleanup_failure',
      'customer-cleanup-failure@example.com',
    );
    await deps.stripeCustomerRepository.insert(user.id, 'cus_cleanup_failure');

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.deleted',
            data: { id: 'clerk_customer_cleanup_failure' },
          },
          'evt_customer_cleanup_failure',
        ),
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
    const deps = createDeps(userRepository);
    const user = await userRepository.upsertByClerkId(
      'clerk_lock_order',
      'lock-order@example.com',
    );
    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_lock_order' },
        },
        'evt_user_deleted_lock_order',
      ),
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
    const clerkEvents = new FakeClerkEventRepository();
    const deletedClerkUsers = new FakeDeletedClerkUserRepository();
    const pendingStripeCustomerCleanups =
      new FakePendingStripeCustomerCleanupRepository();
    const userRepository = new DeleteFailingUserRepository(deleteError);
    const stripeCustomerRepository = new FakeStripeCustomerRepository();
    const customerDeleteCalls: string[] = [];

    const user = await userRepository.upsertByClerkId(
      'clerk_delete_failure',
      'delete-failure@example.com',
    );
    await stripeCustomerRepository.insert(user.id, 'cus_delete_failure');

    const deps = {
      clerkEvents,
      deletedClerkUsers,
      userRepository,
      stripeCustomerRepository,
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: FakeClerkEventRepository;
          deletedClerkUsers: FakeDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
          userRepository: DeleteFailingUserRepository;
          stripeCustomerRepository: FakeStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        fn({
          clerkEvents,
          deletedClerkUsers,
          pendingStripeCustomerCleanups,
          userRepository,
          stripeCustomerRepository,
        }),
      deleteStripeCustomer: async (stripeCustomerId: string) => {
        customerDeleteCalls.push(stripeCustomerId);
      },
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.deleted',
            data: { id: 'clerk_delete_failure' },
          },
          'evt_user_deleted_delete_failure',
        ),
      ),
    ).rejects.toBe(deleteError);

    expect(customerDeleteCalls).toEqual([]);
    await expect(
      userRepository.findByClerkId('clerk_delete_failure'),
    ).resolves.toMatchObject({ email: 'delete-failure@example.com' });
    await expect(
      deletedClerkUsers.exists('clerk_delete_failure'),
    ).resolves.toBe(false);
  });

  it('does nothing for user.deleted when the user does not exist in the database', async () => {
    const deps = createDeps();

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_1' },
        },
        'evt_user_deleted_missing_local_user',
      ),
    );

    expect(deps.customerDeleteCalls).toEqual([]);
  });

  it('still deletes a stray local user when a tombstone already exists', async () => {
    const deps = createDeps();
    await deps.deletedClerkUsers.markDeleted('clerk_stray');

    const user = await deps.userRepository.upsertByClerkId(
      'clerk_stray',
      'stray@example.com',
    );
    await deps.stripeCustomerRepository.insert(user.id, 'cus_stray');

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_stray' },
        },
        'evt_user_deleted_stray_after_tombstone',
      ),
    );

    expect(deps.customerDeleteCalls).toEqual(['cus_stray']);
    await expect(
      deps.userRepository.findByClerkId('clerk_stray'),
    ).resolves.toBeNull();
  });

  it('keeps the local delete committed when post-commit Stripe customer deletion fails', async () => {
    const deps = createDeps();
    const user = await deps.userRepository.upsertByClerkId(
      'clerk_post_commit_cancel',
      'post-commit@example.com',
    );
    await deps.stripeCustomerRepository.insert(user.id, 'cus_post_commit');

    let shouldFailCustomerDelete = true;
    deps.deleteStripeCustomer = async () => {
      if (shouldFailCustomerDelete) {
        throw new Error('stripe customer delete failed');
      }
    };

    const event = withEventId(
      {
        type: 'user.deleted',
        data: { id: 'clerk_post_commit_cancel' },
      },
      'evt_user_deleted_post_commit_cancel',
    );

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
    const customerDeleteCalls: string[] = [];
    const clerkEvents = new FakeClerkEventRepository();
    const deletedClerkUsers = new FakeDeletedClerkUserRepository();
    const pendingStripeCustomerCleanups =
      new FakePendingStripeCustomerCleanupRepository();

    const deps = {
      clerkEvents,
      deletedClerkUsers,
      pendingStripeCustomerCleanups,
      userRepository,
      stripeCustomerRepository,
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: FakeClerkEventRepository;
          deletedClerkUsers: FakeDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
          userRepository: DeletionBarrierUserRepository;
          stripeCustomerRepository: ConcurrentStripeSyncRepository;
        }) => Promise<T>,
      ) =>
        fn({
          clerkEvents,
          deletedClerkUsers,
          pendingStripeCustomerCleanups,
          userRepository,
          stripeCustomerRepository,
        }),
      deleteStripeCustomer: async (stripeCustomerId: string) => {
        customerDeleteCalls.push(stripeCustomerId);
      },
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    const user = await deps.userRepository.upsertByClerkId(
      'clerk_race',
      'race@example.com',
    );

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_race' },
        },
        'evt_user_deleted_race',
      ),
    );

    expect(stripeCustomerRepository.concurrentInsertAttempts).toBe(1);
    expect(stripeCustomerRepository.concurrentInsertBlocked).toBe(1);
    expect(customerDeleteCalls).toEqual([]);
    await expect(
      stripeCustomerRepository.peekStoredMapping(user.id),
    ).resolves.toBeNull();
    await expect(
      userRepository.findByClerkId('clerk_race'),
    ).resolves.toBeNull();
  });

  it('does not recreate a deleted user when the same user.updated delivery is replayed', async () => {
    const deps = createDeps();

    const originalUpdate = withEventId(
      {
        type: 'user.updated',
        data: {
          id: 'clerk_replay',
          primary_email_address_id: 'email_1',
          updated_at: 1769904000000,
          email_addresses: [
            { id: 'email_1', email_address: 'replay@example.com' },
          ],
        },
      },
      'evt_clerk_replay',
    );

    await processClerkWebhook(deps, originalUpdate);
    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_replay' },
        },
        'evt_clerk_delete',
      ),
    );

    await processClerkWebhook(deps, originalUpdate);

    await expect(
      deps.userRepository.findByClerkId('clerk_replay'),
    ).resolves.toBeNull();
  });

  it('ignores later user.updated deliveries after a user has been deleted', async () => {
    const deps = createDeps();

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_tombstone',
            primary_email_address_id: 'email_1',
            updated_at: 1769904001000,
            email_addresses: [
              { id: 'email_1', email_address: 'before-delete@example.com' },
            ],
          },
        },
        'evt_user_updated_before_delete',
      ),
    );

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.deleted',
          data: { id: 'clerk_tombstone' },
        },
        'evt_user_deleted_tombstone',
      ),
    );

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_tombstone',
            primary_email_address_id: 'email_1',
            updated_at: 1769904000000,
            email_addresses: [
              { id: 'email_1', email_address: 'after-delete@example.com' },
            ],
          },
        },
        'evt_user_updated_after_delete',
      ),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_tombstone'),
    ).resolves.toBeNull();
  });

  it('does not recreate a user when deletion commits between the tombstone check and upsert', async () => {
    const clerkEvents = new FakeClerkEventRepository();
    const deletedClerkUsers = new FakeDeletedClerkUserRepository();
    const pendingStripeCustomerCleanups =
      new FakePendingStripeCustomerCleanupRepository();
    const userRepository = new TombstoneDuringUpsertUserRepository(
      deletedClerkUsers,
    );
    const stripeCustomerRepository = new FakeStripeCustomerRepository();

    const deps = {
      clerkEvents,
      deletedClerkUsers,
      pendingStripeCustomerCleanups,
      userRepository,
      stripeCustomerRepository,
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: FakeClerkEventRepository;
          deletedClerkUsers: FakeDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
          userRepository: TombstoneDuringUpsertUserRepository;
          stripeCustomerRepository: FakeStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        fn({
          clerkEvents,
          deletedClerkUsers,
          pendingStripeCustomerCleanups,
          userRepository,
          stripeCustomerRepository,
        }),
      deleteStripeCustomer: async () => undefined,
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    await userRepository.seedUser('clerk_delete_wins', 'before@example.com');
    userRepository.armConcurrentDelete();

    await processClerkWebhook(
      deps,
      withEventId(
        {
          type: 'user.updated',
          data: {
            id: 'clerk_delete_wins',
            primary_email_address_id: 'email_1',
            updated_at: 1769904002000,
            email_addresses: [
              { id: 'email_1', email_address: 'after@example.com' },
            ],
          },
        },
        'evt_user_updated_concurrent_delete_commit',
      ),
    );

    await expect(
      userRepository.findByClerkId('clerk_delete_wins'),
    ).resolves.toBeNull();
    await expect(deletedClerkUsers.exists('clerk_delete_wins')).resolves.toBe(
      true,
    );
    expect(userRepository.deletionCallOrder).toEqual([
      `subscription-lock:${userRepository.lastUpsertedUserId}`,
      'delete:clerk_delete_wins',
    ]);
  });

  it('keeps user.deleted terminal when delete starts before user.updated commits', async () => {
    const updateMayContinue = createDeferred();
    const deleteMayWriteTombstone = createDeferred();
    const updateReachedUpsert = createDeferred();

    const userStore = new TransactionalUserStore(async () => {
      updateReachedUpsert.resolve();
      await updateMayContinue.promise;
    });
    const deletedClerkUserStore = new TransactionalDeletedClerkUserStore(
      async () => {
        await deleteMayWriteTombstone.promise;
      },
    );
    const clerkEvents = new FakeClerkEventRepository();
    const pendingStripeCustomerCleanups =
      new FakePendingStripeCustomerCleanupRepository();
    const stripeCustomerRepository = new FakeStripeCustomerRepository();
    let txCount = 0;

    const deps = {
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: FakeClerkEventRepository;
          deletedClerkUsers: ReturnType<
            TransactionalDeletedClerkUserStore['createRepository']
          >;
          pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
          userRepository: ReturnType<
            TransactionalUserStore['createRepository']
          >;
          stripeCustomerRepository: FakeStripeCustomerRepository;
        }) => Promise<T>,
      ) => {
        txCount += 1;
        const label = txCount === 1 ? 'update' : 'delete';
        const deletedClerkUsers = deletedClerkUserStore.createRepository(label);
        const userRepository = userStore.createRepository(label);
        const result = await fn({
          clerkEvents,
          deletedClerkUsers,
          pendingStripeCustomerCleanups,
          userRepository,
          stripeCustomerRepository,
        });
        userRepository.commit();
        deletedClerkUsers.commit();
        return result;
      },
      deleteStripeCustomer: async () => undefined,
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    const updatedEvent = withEventId(
      {
        type: 'user.updated',
        data: {
          id: 'clerk_late_delete',
          primary_email_address_id: 'email_1',
          updated_at: 1769904004000,
          email_addresses: [
            { id: 'email_1', email_address: 'late-delete@example.com' },
          ],
        },
      },
      'evt_user_updated_late_delete',
    );
    const deletedEvent = withEventId(
      {
        type: 'user.deleted',
        data: { id: 'clerk_late_delete' },
      },
      'evt_user_deleted_late_delete',
    );

    const updatePromise = processClerkWebhook(deps, updatedEvent);
    await updateReachedUpsert.promise;
    const deletePromise = processClerkWebhook(deps, deletedEvent);
    updateMayContinue.resolve();
    await updatePromise;
    deleteMayWriteTombstone.resolve();
    await deletePromise;

    await expect(
      userStore.findCommittedUser('clerk_late_delete'),
    ).resolves.toBeNull();
    await expect(
      deletedClerkUserStore.exists('clerk_late_delete'),
    ).resolves.toBe(true);
  });

  it('truncates unknown raw errors before persisting failed Clerk events', async () => {
    const rawError = {
      toString: () => 'x'.repeat(1205),
    };
    const clerkEvents = new FakeClerkEventRepository();
    const deletedClerkUsers = new FakeDeletedClerkUserRepository();
    const pendingStripeCustomerCleanups =
      new FakePendingStripeCustomerCleanupRepository();
    const userRepository = new ThrowingUserRepository(rawError);
    const stripeCustomerRepository = new FakeStripeCustomerRepository();
    let transactionCount = 0;

    const deps = {
      clerkEvents,
      deletedClerkUsers,
      pendingStripeCustomerCleanups,
      userRepository,
      stripeCustomerRepository,
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: FakeClerkEventRepository;
          deletedClerkUsers: FakeDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
          userRepository: ThrowingUserRepository;
          stripeCustomerRepository: FakeStripeCustomerRepository;
        }) => Promise<T>,
      ) => {
        transactionCount += 1;
        return fn({
          clerkEvents,
          deletedClerkUsers,
          pendingStripeCustomerCleanups,
          userRepository,
          stripeCustomerRepository,
        });
      },
      deleteStripeCustomer: async () => undefined,
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: {
              id: 'clerk_truncate',
              primary_email_address_id: 'email_1',
              updated_at: 1769904003000,
              email_addresses: [
                { id: 'email_1', email_address: 'truncate@example.com' },
              ],
            },
          },
          'evt_user_updated_truncate_unknown_error',
        ),
      ),
    ).rejects.toBe(rawError);

    const storedEvent = clerkEvents
      .snapshot()
      .find(
        ([eventId]) => eventId === 'evt_user_updated_truncate_unknown_error',
      );
    const serializedError = storedEvent?.[1].error;
    expect(serializedError).toBeTruthy();
    expect(JSON.parse(serializedError ?? '{}')).toEqual({});
    expect(serializedError).not.toContain('Unknown error');
    expect(serializedError).not.toContain('x'.repeat(1205));
    expect(transactionCount).toBe(2);
  });

  it('persists only safe driver diagnostics for a failed Clerk event', async () => {
    const postgresError = Object.assign(
      new Error('duplicate key exposes raw Clerk user text'),
      {
        code: '23505',
        constraint: 'users_email_uq',
        detail: 'Key (email)=(clerk-ledger-sentinel@example.com) exists',
      },
    );
    const databaseError = new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to ensure user row',
      undefined,
      { cause: postgresError },
    );
    const clerkEvents = new FakeClerkEventRepository();
    const deletedClerkUsers = new FakeDeletedClerkUserRepository();
    const pendingStripeCustomerCleanups =
      new FakePendingStripeCustomerCleanupRepository();
    const userRepository = new ThrowingUserRepository(databaseError);
    const stripeCustomerRepository = new FakeStripeCustomerRepository();
    let transactionCount = 0;

    const deps = {
      clerkEvents,
      deletedClerkUsers,
      pendingStripeCustomerCleanups,
      userRepository,
      stripeCustomerRepository,
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: FakeClerkEventRepository;
          deletedClerkUsers: FakeDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: FakePendingStripeCustomerCleanupRepository;
          userRepository: ThrowingUserRepository;
          stripeCustomerRepository: FakeStripeCustomerRepository;
        }) => Promise<T>,
      ) => {
        transactionCount += 1;
        return fn({
          clerkEvents,
          deletedClerkUsers,
          pendingStripeCustomerCleanups,
          userRepository,
          stripeCustomerRepository,
        });
      },
      deleteStripeCustomer: async () => undefined,
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: {
              id: 'clerk_truncate',
              primary_email_address_id: 'email_1',
              updated_at: 1769904003000,
              email_addresses: [
                { id: 'email_1', email_address: 'truncate@example.com' },
              ],
            },
          },
          'evt_user_updated_truncate_unknown_error',
        ),
      ),
    ).rejects.toBe(databaseError);

    const storedEvent = clerkEvents
      .snapshot()
      .find(
        ([eventId]) => eventId === 'evt_user_updated_truncate_unknown_error',
      );
    const serializedError = storedEvent?.[1].error;
    expect(serializedError).toBeTruthy();

    const parsedError = JSON.parse(serializedError ?? '{}');
    expect(parsedError).toEqual({
      name: 'ApplicationError',
      code: 'INTERNAL_ERROR',
      sqlState: '23505',
      constraint: 'users_email_uq',
    });
    expect(serializedError).not.toContain('raw Clerk user');
    expect(serializedError).not.toContain('clerk-ledger-sentinel@example.com');
    expect(transactionCount).toBe(2);
  });

  it('rejects user.updated when the payload is missing email addresses', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: { id: 'clerk_1', updated_at: 1769904000000 },
          },
          'evt_user_updated_missing_email_array',
        ),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('rejects user.updated when an email record is missing an email field', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: {
              id: 'clerk_1',
              updated_at: 1769904000000,
              email_addresses: [{ id: 'email_1' }],
            },
          },
          'evt_user_updated_missing_email_field',
        ),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('rejects user.updated when the payload includes an empty user id', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.updated',
            data: {
              id: '',
              updated_at: 1769904000000,
              email_addresses: [
                { id: 'email_1', email_address: 'test@example.com' },
              ],
            },
          },
          'evt_user_updated_empty_user_id',
        ),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Clerk user.updated webhook payload is missing user id',
    });
  });

  it('rejects user.deleted when the payload is invalid', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.deleted',
            data: {},
          },
          'evt_user_deleted_invalid_payload',
        ),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Invalid Clerk user.deleted webhook payload',
    });
  });

  it('rejects user.deleted when the payload includes an empty user id', async () => {
    const deps = createDeps();

    await expect(
      processClerkWebhook(
        deps,
        withEventId(
          {
            type: 'user.deleted',
            data: { id: '' },
          },
          'evt_user_deleted_empty_user_id',
        ),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Clerk user.deleted webhook payload is missing user id',
    });
  });
});
