'use server';

import { subscribeToPlan } from '@/app/pricing/subscribe-to-plan';

export type { SubscribeActionsDeps } from '@/app/pricing/subscribe-to-plan';

export async function subscribeMonthlyAction(
  formData: FormData,
): Promise<void> {
  return subscribeToPlan('monthly', formData);
}

export async function subscribeAnnualAction(formData: FormData): Promise<void> {
  return subscribeToPlan('annual', formData);
}
