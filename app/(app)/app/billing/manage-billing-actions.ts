'use server';

import { redirect } from 'next/navigation';
import { runManageBillingAction } from '@/app/(app)/app/billing/manage-billing-action';
import { logger as appLogger } from '@/lib/logger';
import type {
  CreatePortalSessionFn,
  ManageBillingLogger,
  RedirectFn,
} from '@/lib/manage-billing/manage-billing-types';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';

export type ManageBillingActionDeps = {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
  logger: ManageBillingLogger;
};

function getDeps(
  deps?: Partial<ManageBillingActionDeps>,
): ManageBillingActionDeps {
  const createPortalSessionFn: CreatePortalSessionFn =
    deps?.createPortalSessionFn ?? createPortalSession;

  return {
    createPortalSessionFn,
    redirectFn: deps?.redirectFn ?? redirect,
    logger: deps?.logger ?? appLogger,
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
    logger: d.logger,
  });
}
