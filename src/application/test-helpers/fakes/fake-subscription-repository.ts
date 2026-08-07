import {
  ApplicationError,
  SubscriptionUserMissingError,
} from '@/src/application/errors';
import type {
  SubscriptionRepository,
  SubscriptionUpsertInput,
  SubscriptionUpsertResult,
} from '@/src/application/ports/repositories';
import type { Subscription } from '@/src/domain/entities';
import { shouldPersistSubscriptionWrite } from '@/src/domain/services';

type SubscriptionSnapshot = {
  byUserId: ReadonlyArray<readonly [string, Subscription]>;
  externalSubscriptionIdByUserId: ReadonlyArray<readonly [string, string]>;
  userIdByExternalSubscriptionId: ReadonlyArray<readonly [string, string]>;
  observationVersionByUserId: ReadonlyArray<readonly [string, number]>;
  missingUserIds: ReadonlyArray<string>;
};

type FakeSubscriptionSeed =
  | Subscription
  | {
      subscription: Subscription;
      externalSubscriptionId: string;
      version?: number;
    };

function cloneSubscription(subscription: Subscription): Subscription {
  return {
    ...subscription,
    currentPeriodEnd: new Date(subscription.currentPeriodEnd),
    createdAt: new Date(subscription.createdAt),
    updatedAt: new Date(subscription.updatedAt),
  };
}

function isMappedSeed(
  seed: FakeSubscriptionSeed,
): seed is { subscription: Subscription; externalSubscriptionId: string } {
  return 'subscription' in seed;
}

export class FakeSubscriptionRepository implements SubscriptionRepository {
  private readonly byUserId = new Map<string, Subscription>();
  private readonly externalSubscriptionIdByUserId = new Map<string, string>();
  private readonly userIdByExternalSubscriptionId = new Map<string, string>();
  private readonly observationVersionByUserId = new Map<string, number>();
  private readonly missingUserIds = new Set<string>();

  constructor(
    subscriptions: readonly FakeSubscriptionSeed[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const seed of subscriptions) {
      const subscription = isMappedSeed(seed) ? seed.subscription : seed;
      this.byUserId.set(subscription.userId, cloneSubscription(subscription));
      this.observationVersionByUserId.set(
        subscription.userId,
        isMappedSeed(seed) ? (seed.version ?? 0) : 0,
      );

      if (isMappedSeed(seed)) {
        this.externalSubscriptionIdByUserId.set(
          subscription.userId,
          seed.externalSubscriptionId,
        );
        this.userIdByExternalSubscriptionId.set(
          seed.externalSubscriptionId,
          subscription.userId,
        );
      }
    }
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.byUserId.get(userId) ?? null;
  }

  async findExternalSubscriptionIdByUserId(
    userId: string,
  ): Promise<string | null> {
    return this.externalSubscriptionIdByUserId.get(userId) ?? null;
  }

  async findObservationVersionByUserId(userId: string): Promise<number | null> {
    return this.observationVersionByUserId.get(userId) ?? null;
  }

  async findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<Subscription | null> {
    const userId = this.userIdByExternalSubscriptionId.get(
      externalSubscriptionId,
    );
    if (!userId) return null;
    return this.byUserId.get(userId) ?? null;
  }

  markUserMissing(userId: string): void {
    this.missingUserIds.add(userId);
    this.byUserId.delete(userId);
    this.observationVersionByUserId.delete(userId);

    const externalSubscriptionId =
      this.externalSubscriptionIdByUserId.get(userId);
    this.externalSubscriptionIdByUserId.delete(userId);
    if (externalSubscriptionId) {
      this.userIdByExternalSubscriptionId.delete(externalSubscriptionId);
    }
  }

  async upsert(
    input: SubscriptionUpsertInput,
  ): Promise<SubscriptionUpsertResult> {
    if (this.missingUserIds.has(input.userId)) {
      throw new SubscriptionUserMissingError(input.userId);
    }

    const now = this.now();
    const existing = this.byUserId.get(input.userId);
    const storedVersion = existing
      ? (this.observationVersionByUserId.get(input.userId) ?? 0)
      : null;
    if (storedVersion !== input.expectedVersion) {
      return { persisted: false, reason: 'version_conflict' };
    }

    const existingExternalSubscriptionId =
      this.externalSubscriptionIdByUserId.get(input.userId);
    if (
      existing &&
      existingExternalSubscriptionId &&
      !shouldPersistSubscriptionWrite({
        stored: {
          subscriptionIdentity: existingExternalSubscriptionId,
          status: existing.status,
          currentPeriodEnd: existing.currentPeriodEnd,
        },
        incoming: {
          subscriptionIdentity: input.externalSubscriptionId,
          status: input.status,
          currentPeriodEnd: input.currentPeriodEnd,
        },
        now,
      })
    ) {
      return {
        persisted: false,
        reason: 'write_guard_rejected',
        current: cloneSubscription(existing),
      };
    }

    const mappedUserId = this.userIdByExternalSubscriptionId.get(
      input.externalSubscriptionId,
    );
    if (mappedUserId && mappedUserId !== input.userId) {
      throw new ApplicationError(
        'CONFLICT',
        'External subscription id is already mapped to a different user',
      );
    }

    const subscription: Subscription = {
      id: existing?.id ?? crypto.randomUUID(),
      userId: input.userId,
      plan: input.plan,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const previousExternalSubscriptionId =
      this.externalSubscriptionIdByUserId.get(input.userId);
    if (
      previousExternalSubscriptionId &&
      previousExternalSubscriptionId !== input.externalSubscriptionId
    ) {
      this.userIdByExternalSubscriptionId.delete(
        previousExternalSubscriptionId,
      );
    }

    this.byUserId.set(input.userId, cloneSubscription(subscription));
    this.externalSubscriptionIdByUserId.set(
      input.userId,
      input.externalSubscriptionId,
    );
    this.userIdByExternalSubscriptionId.set(
      input.externalSubscriptionId,
      input.userId,
    );
    this.observationVersionByUserId.set(input.userId, (storedVersion ?? 0) + 1);
    return { persisted: true };
  }

  snapshot(): SubscriptionSnapshot {
    return {
      byUserId: [...this.byUserId.entries()].map(([userId, subscription]) => [
        userId,
        cloneSubscription(subscription),
      ]),
      externalSubscriptionIdByUserId: [
        ...this.externalSubscriptionIdByUserId.entries(),
      ],
      userIdByExternalSubscriptionId: [
        ...this.userIdByExternalSubscriptionId.entries(),
      ],
      observationVersionByUserId: [
        ...this.observationVersionByUserId.entries(),
      ],
      missingUserIds: [...this.missingUserIds],
    };
  }

  restore(snapshot: SubscriptionSnapshot): void {
    this.byUserId.clear();
    for (const [userId, subscription] of snapshot.byUserId) {
      this.byUserId.set(userId, cloneSubscription(subscription));
    }

    this.externalSubscriptionIdByUserId.clear();
    for (const [
      userId,
      externalSubscriptionId,
    ] of snapshot.externalSubscriptionIdByUserId) {
      this.externalSubscriptionIdByUserId.set(userId, externalSubscriptionId);
    }

    this.userIdByExternalSubscriptionId.clear();
    for (const [
      externalSubscriptionId,
      userId,
    ] of snapshot.userIdByExternalSubscriptionId) {
      this.userIdByExternalSubscriptionId.set(externalSubscriptionId, userId);
    }

    this.observationVersionByUserId.clear();
    for (const [userId, version] of snapshot.observationVersionByUserId) {
      this.observationVersionByUserId.set(userId, version);
    }

    this.missingUserIds.clear();
    for (const userId of snapshot.missingUserIds) {
      this.missingUserIds.add(userId);
    }
  }
}
