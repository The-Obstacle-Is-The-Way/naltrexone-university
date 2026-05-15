import {
  type ApplicationError,
  isApplicationError,
} from '@/src/application/errors';

export const STRIPE_SUBSCRIPTION_METADATA_USER_ID_FIELD = 'metadata.user_id';
export const STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD =
  'metadata.e2e_owner';

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

export function isE2EOwnerMismatchEvent(
  error: unknown,
): error is ApplicationError {
  return (
    isApplicationError(error) &&
    error.code === 'STRIPE_ERROR' &&
    error.fieldErrors?.[STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]?.includes(
      'mismatch',
    ) === true
  );
}
