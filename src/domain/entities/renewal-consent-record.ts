import { DomainError } from '../errors';
import type {
  RenewalConsentFrequency,
  RenewalConsentKind,
  RenewalConsentSource,
  SubscriptionPlan,
} from '../value-objects';
import { computeRenewalConsentRetainUntil } from '../value-objects';

export type RenewalConsentRecordInput = {
  userId: string | null;
  consumerReference: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  checkoutSessionId: string | null;
  setupSessionId: string | null;
  plan: SubscriptionPlan;
  amountCents: number;
  currency: 'usd';
  frequency: RenewalConsentFrequency;
  trialEndsAt: Date | null;
  cancellationDeadline: Date;
  cancellationMethod: string;
  disclosureSnapshot: string;
  disclosureVersion: string;
  termsVersion: string;
  termsHash: string;
  consentSource: RenewalConsentSource;
  acceptedAt: Date;
  consentKind: RenewalConsentKind;
  priorAmountCents: number | null;
  proposedAmountCents: number | null;
  effectiveRenewalAt: Date | null;
};

export type NewRenewalConsentRecord = RenewalConsentRecordInput & {
  subscriptionTerminatedAt: Date | null;
  retainUntil: Date;
};

export type RenewalConsentRecord = NewRenewalConsentRecord & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

const PSEUDONYMOUS_REFERENCE_PATTERN = /^[a-f0-9]{64}$/;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function newRenewalConsentRecord(
  input: RenewalConsentRecordInput,
): NewRenewalConsentRecord {
  if (!PSEUDONYMOUS_REFERENCE_PATTERN.test(input.consumerReference)) {
    throw new DomainError(
      'INVALID_RENEWAL_CONSENT',
      'Renewal consent consumer reference must be a SHA-256 value',
    );
  }
  if (!isPositiveInteger(input.amountCents)) {
    throw new DomainError(
      'INVALID_RENEWAL_CONSENT',
      'Renewal consent amount must be a positive integer',
    );
  }

  const hasCheckoutSession = input.checkoutSessionId !== null;
  const hasSetupSession = input.setupSessionId !== null;
  if (
    (input.consentSource === 'stripe_checkout' &&
      (!hasCheckoutSession || hasSetupSession)) ||
    (input.consentSource === 'stripe_setup' &&
      (!hasSetupSession || hasCheckoutSession)) ||
    (input.consentSource === 'application' &&
      (hasCheckoutSession || hasSetupSession))
  ) {
    throw new DomainError(
      'INVALID_RENEWAL_CONSENT',
      'Renewal consent source must match its allowed Stripe Session shape',
    );
  }

  const priceIncreaseValues = [
    input.priorAmountCents,
    input.proposedAmountCents,
    input.effectiveRenewalAt,
  ];
  const hasAllPriceIncreaseValues = priceIncreaseValues.every(
    (value) => value !== null,
  );
  const hasNoPriceIncreaseValues = priceIncreaseValues.every(
    (value) => value === null,
  );
  if (
    (input.consentKind === 'initial_offer' && !hasNoPriceIncreaseValues) ||
    (input.consentKind === 'price_increase' && !hasAllPriceIncreaseValues) ||
    (input.priorAmountCents !== null &&
      !isPositiveInteger(input.priorAmountCents)) ||
    (input.proposedAmountCents !== null &&
      !isPositiveInteger(input.proposedAmountCents))
  ) {
    throw new DomainError(
      'INVALID_RENEWAL_CONSENT',
      'Renewal consent price-increase terms do not match its kind',
    );
  }

  return {
    ...input,
    subscriptionTerminatedAt: null,
    retainUntil: computeRenewalConsentRetainUntil(input.acceptedAt, null),
  };
}

export function terminateRenewalConsentRecord<
  T extends NewRenewalConsentRecord,
>(record: T, terminatedAt: Date): T {
  const effectiveTerminatedAt =
    record.subscriptionTerminatedAt &&
    record.subscriptionTerminatedAt > terminatedAt
      ? record.subscriptionTerminatedAt
      : terminatedAt;

  return {
    ...record,
    subscriptionTerminatedAt: new Date(effectiveTerminatedAt),
    retainUntil: computeRenewalConsentRetainUntil(
      record.acceptedAt,
      effectiveTerminatedAt,
    ),
  };
}
