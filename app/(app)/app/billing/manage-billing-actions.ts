'use server';

import { submitManageBilling } from '@/app/(app)/app/billing/manage-billing-request';

export type { ManageBillingActionDeps } from '@/app/(app)/app/billing/manage-billing-request';

export async function manageBillingAction(formData: FormData): Promise<void> {
  // BUG-324: a client chooses this argument, and only a submitted form gives
  // FormData. Anything else is not from our page, so do nothing and log
  // nothing.
  if (!(formData instanceof FormData)) return;
  return submitManageBilling(formData);
}
