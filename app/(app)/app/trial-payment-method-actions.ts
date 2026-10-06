'use server';

import { executeCreateTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-action-handler';

export async function createTrialPaymentMethodAction(
  formData: FormData,
): Promise<void> {
  // BUG-324: a client chooses this argument, and only a submitted form gives
  // FormData. Anything else is not from our page, so do nothing and log
  // nothing.
  if (!(formData instanceof FormData)) return;
  return executeCreateTrialPaymentMethodAction(formData);
}
