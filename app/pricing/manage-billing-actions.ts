'use server';

import { submitManageBilling } from '@/app/pricing/manage-billing-request';

export type { ManageBillingActionDeps } from '@/app/pricing/manage-billing-request';

export async function manageBillingAction(formData: FormData): Promise<void> {
  return submitManageBilling(formData);
}
