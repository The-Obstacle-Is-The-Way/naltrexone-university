import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  isMissingStripeSubscriptionUserIdError,
  STRIPE_SUBSCRIPTION_METADATA_USER_ID_FIELD,
} from './stripe-subscription-errors';

describe('isMissingStripeSubscriptionUserIdError', () => {
  it('returns true for the structured missing metadata.user_id Stripe error', () => {
    const error = new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription metadata.user_id is required',
      {
        [STRIPE_SUBSCRIPTION_METADATA_USER_ID_FIELD]: ['required'],
      },
    );

    expect(isMissingStripeSubscriptionUserIdError(error)).toBe(true);
  });

  it('returns false for unrelated Stripe errors', () => {
    const error = new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription price id does not match a configured plan',
    );

    expect(isMissingStripeSubscriptionUserIdError(error)).toBe(false);
  });
});
