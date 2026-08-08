'use server';

import { executeCreateTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-action-handler';

export async function createTrialPaymentMethodAction(
  formData: FormData,
): Promise<void> {
  return executeCreateTrialPaymentMethodAction(formData);
}
