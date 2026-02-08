import type {
  CreatePortalSessionFn,
  RedirectFn,
} from '@/app/pricing/manage-billing-types';
import { ROUTES } from '@/lib/routes';

export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
}): Promise<void> {
  const result = await deps.createPortalSessionFn({});
  if (result.ok) return deps.redirectFn(result.data.url);

  if (result.error.code === 'UNAUTHENTICATED') {
    return deps.redirectFn(ROUTES.SIGN_UP);
  }

  const url = new URL(ROUTES.PRICING, 'https://example.com');
  url.searchParams.set('checkout', 'error');

  return deps.redirectFn(`${url.pathname}${url.search}`);
}
