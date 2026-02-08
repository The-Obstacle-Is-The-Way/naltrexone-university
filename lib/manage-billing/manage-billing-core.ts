import type {
  CreatePortalSessionFn,
  ManageBillingRedirects,
  RedirectFn,
} from '@/lib/manage-billing/manage-billing-types';
import type { ApplicationErrorCode } from '@/src/application/errors';

export function getManageBillingErrorRedirect(
  errorCode: ApplicationErrorCode,
  redirects: ManageBillingRedirects,
): string {
  if (errorCode === 'UNAUTHENTICATED' && redirects.unauthenticated) {
    return redirects.unauthenticated;
  }

  return redirects.failure;
}

export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
  redirects: ManageBillingRedirects;
}): Promise<void> {
  let result: Awaited<ReturnType<CreatePortalSessionFn>>;
  try {
    result = await deps.createPortalSessionFn({});
  } catch {
    return deps.redirectFn(deps.redirects.failure);
  }
  if (result.ok) return deps.redirectFn(result.data.url);

  return deps.redirectFn(
    getManageBillingErrorRedirect(result.error.code, deps.redirects),
  );
}
