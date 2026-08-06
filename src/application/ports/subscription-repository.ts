import type { Subscription } from '@/src/domain/entities';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/src/domain/value-objects';

export type SubscriptionUpsertInput = {
  userId: string;
  externalSubscriptionId: string; // opaque external id
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  expectedVersion: number | null;
};

export type SubscriptionUpsertResult =
  | { persisted: true }
  | {
      persisted: false;
      reason: 'write_guard_rejected';
      current: Subscription;
    }
  | { persisted: false; reason: 'version_conflict' };

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;

  findExternalSubscriptionIdByUserId(userId: string): Promise<string | null>;

  findObservationVersionByUserId(userId: string): Promise<number | null>;

  findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<Subscription | null>;

  upsert(input: SubscriptionUpsertInput): Promise<SubscriptionUpsertResult>;
}
