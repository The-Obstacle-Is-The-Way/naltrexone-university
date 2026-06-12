import { ApplicationError } from '@/src/application/errors';
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
};

type FakeSubscriptionSeed =
  | Subscription
  | {
      subscription: Subscription;
      externalSubscriptionId: string;
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

  constructor(
    subscriptions: readonly FakeSubscriptionSeed[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const seed of subscriptions) {
      const subscription = isMappedSeed(seed) ? seed.subscription : seed;
      this.byUserId.set(subscription.userId, cloneSubscription(subscription));

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

  async findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<Subscription | null> {
    const userId = this.userIdByExternalSubscriptionId.get(
      externalSubscriptionId,
    );
    if (!userId) return null;
    return this.byUserId.get(userId) ?? null;
  }

  async upsert(
    input: SubscriptionUpsertInput,
  ): Promise<SubscriptionUpsertResult> {
    const mappedUserId = this.userIdByExternalSubscriptionId.get(
      input.externalSubscriptionId,
    );

    if (mappedUserId && mappedUserId !== input.userId) {
      throw new ApplicationError(
        'CONFLICT',
        'External subscription id is already mapped to a different user',
      );
    }

    const now = this.now();
    const existing = this.byUserId.get(input.userId);
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
      return { persisted: false, current: cloneSubscription(existing) };
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
  }
}
