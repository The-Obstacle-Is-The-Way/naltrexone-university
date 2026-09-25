import { describe, expect, it } from 'vitest';
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
import {
  clerkUserDeletedEvent,
  clerkUserUpdatedEvent,
} from '@/tests/shared/clerk-events';
import { createClerkWebhookTestDeps } from './test-helpers/clerk-webhook-controller-harness';

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

class UpsertRecordingUserRepository extends FakeUserRepository {
  readonly upsertedClerkIds: string[] = [];

  override async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: Parameters<FakeUserRepository['upsertByClerkId']>[2],
  ) {
    this.upsertedClerkIds.push(clerkId);
    return super.upsertByClerkId(clerkId, email, options);
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

// The update both failure-persistence cases deliver; the injected user
// repository throws while applying it.
function failingUpdate() {
  return clerkUserUpdatedEvent({
    eventId: 'evt_user_updated_truncate_unknown_error',
    clerkUserId: 'clerk_truncate',
    email: 'truncate@example.com',
    updatedAt: 1769904003000,
  });
}

function storedFailure(deps: ReturnType<typeof createClerkWebhookTestDeps>) {
  return deps.clerkEvents
    .snapshot()
    .find(
      ([eventId]) => eventId === 'evt_user_updated_truncate_unknown_error',
    )?.[1].error;
}

describe('processClerkWebhook update and delete ordering', () => {
  it('does not recreate a deleted user when the same user.updated delivery is replayed', async () => {
    const deps = createClerkWebhookTestDeps();
    const originalUpdate = clerkUserUpdatedEvent({
      eventId: 'evt_clerk_replay',
      clerkUserId: 'clerk_replay',
      email: 'replay@example.com',
      updatedAt: 1769904000000,
    });

    await processClerkWebhook(deps, originalUpdate);
    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_clerk_delete',
        clerkUserId: 'clerk_replay',
      }),
    );
    await processClerkWebhook(deps, originalUpdate);

    await expect(
      deps.userRepository.findByClerkId('clerk_replay'),
    ).resolves.toBeNull();
  });

  it('ignores later user.updated deliveries after a user has been deleted', async () => {
    const userRepository = new UpsertRecordingUserRepository();
    const deps = createClerkWebhookTestDeps({ userRepository });

    await processClerkWebhook(
      deps,
      clerkUserUpdatedEvent({
        eventId: 'evt_user_updated_before_delete',
        clerkUserId: 'clerk_tombstone',
        email: 'before-delete@example.com',
        updatedAt: 1769904001000,
      }),
    );
    await processClerkWebhook(
      deps,
      clerkUserDeletedEvent({
        eventId: 'evt_user_deleted_tombstone',
        clerkUserId: 'clerk_tombstone',
      }),
    );
    await processClerkWebhook(
      deps,
      clerkUserUpdatedEvent({
        eventId: 'evt_user_updated_after_delete',
        clerkUserId: 'clerk_tombstone',
        email: 'after-delete@example.com',
        updatedAt: 1769904000000,
      }),
    );

    await expect(
      deps.userRepository.findByClerkId('clerk_tombstone'),
    ).resolves.toBeNull();
    // The tombstone stops the later delivery before any upsert, not only
    // after one (the post-upsert re-check would also leave no row).
    expect(userRepository.upsertedClerkIds).toEqual(['clerk_tombstone']);
  });

  it('does not recreate a user when deletion commits between the tombstone check and upsert', async () => {
    const deletedClerkUsers = new FakeDeletedClerkUserRepository();
    const userRepository = new TombstoneDuringUpsertUserRepository(
      deletedClerkUsers,
    );
    const deps = createClerkWebhookTestDeps({
      userRepository,
      deletedClerkUsers,
    });

    await userRepository.seedUser('clerk_delete_wins', 'before@example.com');
    userRepository.armConcurrentDelete();

    await processClerkWebhook(
      deps,
      clerkUserUpdatedEvent({
        eventId: 'evt_user_updated_concurrent_delete_commit',
        clerkUserId: 'clerk_delete_wins',
        email: 'after@example.com',
        updatedAt: 1769904002000,
      }),
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

    const updatedEvent = clerkUserUpdatedEvent({
      eventId: 'evt_user_updated_late_delete',
      clerkUserId: 'clerk_late_delete',
      email: 'late-delete@example.com',
      updatedAt: 1769904004000,
    });
    const deletedEvent = clerkUserDeletedEvent({
      eventId: 'evt_user_deleted_late_delete',
      clerkUserId: 'clerk_late_delete',
    });

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
    const deps = createClerkWebhookTestDeps({
      userRepository: new ThrowingUserRepository(rawError),
    });

    await expect(processClerkWebhook(deps, failingUpdate())).rejects.toBe(
      rawError,
    );

    const serializedError = storedFailure(deps);
    expect(serializedError).toBeTruthy();
    expect(JSON.parse(serializedError ?? '{}')).toEqual({});
    expect(serializedError).not.toContain('Unknown error');
    expect(serializedError).not.toContain('x'.repeat(1205));
    expect(deps.transactions.count).toBe(2);
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
    const deps = createClerkWebhookTestDeps({
      userRepository: new ThrowingUserRepository(databaseError),
    });

    await expect(processClerkWebhook(deps, failingUpdate())).rejects.toBe(
      databaseError,
    );

    const serializedError = storedFailure(deps);
    expect(serializedError).toBeTruthy();
    expect(JSON.parse(serializedError ?? '{}')).toEqual({
      name: 'ApplicationError',
      code: 'INTERNAL_ERROR',
      sqlState: '23505',
      constraint: 'users_email_uq',
    });
    expect(serializedError).not.toContain('raw Clerk user');
    expect(serializedError).not.toContain('clerk-ledger-sentinel@example.com');
    expect(deps.transactions.count).toBe(2);
  });
});
