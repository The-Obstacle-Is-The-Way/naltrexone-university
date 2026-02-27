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
}): Promise<void> {
  return runManageBillingActionCore({
    ...deps,
    redirects: {
      failure: `${ROUTES.APP_BILLING}?error=portal_failed`,
      unauthenticated: ROUTES.SIGN_UP,
    },
  });
}
