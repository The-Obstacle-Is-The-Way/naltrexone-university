import { runManageBillingAction as runManageBillingActionCore } from '@/lib/manage-billing/manage-billing-core';
import type {
  CreatePortalSessionFn,
  ManageBillingLogger,
  RedirectFn,
} from '@/lib/manage-billing/manage-billing-types';
import { ROUTES } from '@/lib/routes';

export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
  logger?: ManageBillingLogger;
  idempotencyKey?: string;
}): Promise<void> {
  return runManageBillingActionCore({
    ...deps,
    redirects: {
      failure: `${ROUTES.PRICING}?portal=error`,
      unauthenticated: ROUTES.SIGN_UP,
    },
  });
}
