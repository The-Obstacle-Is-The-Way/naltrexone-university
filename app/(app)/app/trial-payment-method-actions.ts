'use server';

import { executeCreateTrialPaymentMethodAction } from './trial-payment-method-action-handler';

export async function createTrialPaymentMethodAction(
  formData: FormData,
): Promise<void> {
  return executeCreateTrialPaymentMethodAction(formData);
}
