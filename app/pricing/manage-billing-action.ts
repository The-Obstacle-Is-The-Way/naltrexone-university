import { runManageBillingAction as runManageBillingActionCore } from '@/lib/manage-billing/manage-billing-core';
import type {
  CreatePortalSessionFn,
  RedirectFn,
} from '@/lib/manage-billing/manage-billing-types';
import { ROUTES } from '@/lib/routes';

export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
}): Promise<void> {
  return runManageBillingActionCore({
    ...deps,
    redirects: {
      failure: `${ROUTES.PRICING}?checkout=error`,
      unauthenticated: ROUTES.SIGN_UP,
    },
  });
}
