'use server';

import { subscribeToPlan } from '@/app/pricing/subscribe-to-plan';

export type { SubscribeActionsDeps } from '@/app/pricing/subscribe-to-plan';

export async function subscribeMonthlyAction(
  formData: FormData,
): Promise<void> {
  // BUG-324: a client chooses this argument, and only a submitted form gives
  // FormData. Anything else is not from our page, so do nothing and log
  // nothing.
  if (!(formData instanceof FormData)) return;
  return subscribeToPlan('monthly', formData);
}

export async function subscribeAnnualAction(formData: FormData): Promise<void> {
  if (!(formData instanceof FormData)) return;
  return subscribeToPlan('annual', formData);
}
