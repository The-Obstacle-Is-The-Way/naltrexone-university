import {
  type ApplicationError,
  isApplicationError,
} from '@/src/application/errors';

export const STRIPE_SUBSCRIPTION_METADATA_USER_ID_FIELD = 'metadata.user_id';

export function isMissingStripeSubscriptionUserIdError(
  error: unknown,
): error is ApplicationError {
  return (
    isApplicationError(error) &&
    error.code === 'STRIPE_ERROR' &&
    error.fieldErrors?.[STRIPE_SUBSCRIPTION_METADATA_USER_ID_FIELD]?.includes(
      'required',
    ) === true
  );
}
