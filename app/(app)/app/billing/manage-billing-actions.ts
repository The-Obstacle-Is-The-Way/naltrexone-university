'use server';

import { submitManageBilling } from '@/app/(app)/app/billing/manage-billing-request';

export type { ManageBillingActionDeps } from '@/app/(app)/app/billing/manage-billing-request';

export async function manageBillingAction(formData: FormData): Promise<void> {
  return submitManageBilling(formData);
}
