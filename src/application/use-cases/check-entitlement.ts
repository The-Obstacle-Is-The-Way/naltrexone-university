import {
  determineNonEntitledReason,
  isEntitled,
  type NonEntitledReason,
} from '@/src/domain/services';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import type { SubscriptionRepository } from '../ports/repositories';

export type CheckEntitlementInput = { userId: string };
export type { NonEntitledReason } from '@/src/domain/services';

export type CheckEntitlementOutput = {
  isEntitled: boolean;
  reason?: NonEntitledReason | null;
  subscriptionStatus?: SubscriptionStatus | null;
  hasActiveSubscriptionPeriod?: boolean;
  /**
   * Trial end timestamp while the subscription is `inTrial`, sourced from the
   * persisted `currentPeriodEnd` (Stripe sets period end to trial end during a
   * trial); null for every other status.
   */
  trialEndsAt?: Date | null;
};

export class CheckEntitlementUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CheckEntitlementInput): Promise<CheckEntitlementOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    if (!subscription) {
      return {
        isEntitled: false,
        reason: 'subscription_required',
        subscriptionStatus: null,
        hasActiveSubscriptionPeriod: false,
        trialEndsAt: null,
      };
    }

    const now = this.now();
    const entitled = isEntitled(subscription, now);
    const hasActiveSubscriptionPeriod = subscription.currentPeriodEnd > now;
    const reason: NonEntitledReason | null = entitled
      ? null
      : determineNonEntitledReason(
          subscription.status,
          hasActiveSubscriptionPeriod,
        );

    return {
      isEntitled: entitled,
      reason,
      subscriptionStatus: subscription.status,
      hasActiveSubscriptionPeriod,
      trialEndsAt:
        subscription.status === 'inTrial'
          ? subscription.currentPeriodEnd
          : null,
    };
  }
}
