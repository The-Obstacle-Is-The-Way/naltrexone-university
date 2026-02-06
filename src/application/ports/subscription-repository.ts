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
};

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;

  findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<Subscription | null>;

  upsert(input: SubscriptionUpsertInput): Promise<void>;
}
