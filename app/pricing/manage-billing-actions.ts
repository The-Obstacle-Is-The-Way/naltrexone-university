'use server';

import { redirect } from 'next/navigation';
import { runManageBillingAction } from '@/app/pricing/manage-billing-action';
import type {
  CreatePortalSessionFn,
  RedirectFn,
} from '@/app/pricing/manage-billing-types';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';

export type ManageBillingActionDeps = {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
};

function getDeps(
  deps?: Partial<ManageBillingActionDeps>,
): ManageBillingActionDeps {
  const createPortalSessionFn: CreatePortalSessionFn =
    deps?.createPortalSessionFn ?? createPortalSession;

  return {
    createPortalSessionFn,
    redirectFn: deps?.redirectFn ?? redirect,
  };
}

export async function manageBillingAction(
  _formData: FormData,
  deps?: Partial<ManageBillingActionDeps>,
): Promise<void> {
  const d = getDeps(deps);
  return runManageBillingAction({
    createPortalSessionFn: d.createPortalSessionFn,
    redirectFn: d.redirectFn,
  });
}
