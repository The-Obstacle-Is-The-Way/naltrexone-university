'use server';

import { redirect } from 'next/navigation';
import { runManageBillingAction } from '@/app/pricing/manage-billing-action';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';

type RedirectFn = (url: string) => never;

type CreatePortalSessionFn = (
  input: Record<string, never>,
) => Promise<ActionResult<{ url: string }>>;

export type ManageBillingActionDeps = {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
};

async function getDeps(
  deps?: Partial<ManageBillingActionDeps>,
): Promise<ManageBillingActionDeps> {
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
  const d = await getDeps(deps);
  return runManageBillingAction({
    createPortalSessionFn: d.createPortalSessionFn,
    redirectFn: d.redirectFn,
  });
}
