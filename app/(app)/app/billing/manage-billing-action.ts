import type {
  CreatePortalSessionFn,
  RedirectFn,
} from '@/app/(app)/app/billing/manage-billing-types';
import { ROUTES } from '@/lib/routes';

export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
}): Promise<void> {
  const result = await deps.createPortalSessionFn({});
  if (result.ok) return deps.redirectFn(result.data.url);

  return deps.redirectFn(`${ROUTES.APP_BILLING}?error=portal_failed`);
}
