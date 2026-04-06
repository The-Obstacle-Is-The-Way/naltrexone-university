import type {
  CreatePortalSessionFn,
  ManageBillingLogger,
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
  logger?: ManageBillingLogger;
  idempotencyKey?: string;
}): Promise<void> {
  let result: Awaited<ReturnType<CreatePortalSessionFn>>;
  try {
    result = await deps.createPortalSessionFn({
      idempotencyKey: deps.idempotencyKey,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorContext = {
      error: errorMessage,
      ...(error instanceof Error ? { errorName: error.name } : {}),
      ...(error instanceof Error && error.stack
        ? { errorStack: error.stack }
        : {}),
    };
    try {
      deps.logger?.error(errorContext, 'Billing portal session creation threw');
    } catch {
      // Never let logging failures block the fallback redirect.
    }
    return deps.redirectFn(deps.redirects.failure);
  }
  if (result.ok) return deps.redirectFn(result.data.url);

  return deps.redirectFn(
    getManageBillingErrorRedirect(result.error.code, deps.redirects),
  );
}
