'use server';

import { redirect } from 'next/navigation';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';
import { runManageBillingAction } from './manage-billing-action';

export async function manageBillingAction(): Promise<void> {
  return runManageBillingAction({
    createPortalSessionFn: createPortalSession,
    redirectFn: redirect,
  });
}
