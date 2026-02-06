import { isEntitled } from '@/src/domain/services';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import type { SubscriptionRepository } from '../ports/repositories';

export type CheckEntitlementInput = { userId: string };

export type NonEntitledReason =
  | 'subscription_required'
  | 'payment_processing'
  | 'manage_billing';

export type CheckEntitlementOutput = {
  isEntitled: boolean;
  reason?: NonEntitledReason | null;
  subscriptionStatus?: SubscriptionStatus | null;
  hasActiveSubscriptionPeriod?: boolean;
};

function getNonEntitledReason(
  status: SubscriptionStatus,
  hasActiveSubscriptionPeriod: boolean,
): NonEntitledReason {
  if (!hasActiveSubscriptionPeriod) return 'subscription_required';
  if (status === 'paymentProcessing' || status === 'paymentFailed') {
    return 'payment_processing';
  }
  return 'manage_billing';
}

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
      };
    }

    const now = this.now();
    const entitled = isEntitled(subscription, now);
    const hasActiveSubscriptionPeriod = subscription.currentPeriodEnd > now;
    const reason: NonEntitledReason | null = entitled
      ? null
      : getNonEntitledReason(subscription.status, hasActiveSubscriptionPeriod);

    return {
      isEntitled: entitled,
      reason,
      subscriptionStatus: subscription.status,
      hasActiveSubscriptionPeriod,
    };
  }
}
