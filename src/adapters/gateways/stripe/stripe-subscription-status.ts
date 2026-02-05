import {
  type StripeSubscriptionStatus,
  stripeSubscriptionStatusEnum,
} from '@/db/schema';
import type { SubscriptionStatus } from '@/src/domain/value-objects';

const stripeToDomain: Record<StripeSubscriptionStatus, SubscriptionStatus> = {
  incomplete: 'paymentProcessing',
  incomplete_expired: 'paymentFailed',
  trialing: 'inTrial',
  active: 'active',
  past_due: 'pastDue',
  canceled: 'canceled',
  unpaid: 'unpaid',
  paused: 'paused',
};

const domainToStripe: Record<SubscriptionStatus, StripeSubscriptionStatus> = {
  paymentProcessing: 'incomplete',
  paymentFailed: 'incomplete_expired',
  inTrial: 'trialing',
  active: 'active',
  pastDue: 'past_due',
  canceled: 'canceled',
  unpaid: 'unpaid',
  paused: 'paused',
};

export function isValidStripeSubscriptionStatus(
  value: string,
): value is StripeSubscriptionStatus {
  return (
    stripeSubscriptionStatusEnum.enumValues as readonly string[]
  ).includes(value);
}

export function stripeSubscriptionStatusToSubscriptionStatus(
  status: StripeSubscriptionStatus,
): SubscriptionStatus {
  return stripeToDomain[status];
}

export function subscriptionStatusToStripeSubscriptionStatus(
  status: SubscriptionStatus,
): StripeSubscriptionStatus {
  return domainToStripe[status];
}
