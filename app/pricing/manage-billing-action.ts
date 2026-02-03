import type {
  CreatePortalSessionFn,
  RedirectFn,
} from '@/app/pricing/manage-billing-types';

export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
}): Promise<void> {
  const result = await deps.createPortalSessionFn({});
  if (result.ok) return deps.redirectFn(result.data.url);

  if (result.error.code === 'UNAUTHENTICATED') {
    return deps.redirectFn('/sign-up');
  }

  const url = new URL('/pricing', 'https://example.com');
  url.searchParams.set('checkout', 'error');
  url.searchParams.set('error_code', result.error.code);

  if (process.env.NODE_ENV === 'development') {
    const rawMessage = result.error.message;
    const safeMessage =
      rawMessage.length > 200 ? `${rawMessage.slice(0, 200)}…` : rawMessage;
    url.searchParams.set('error_message', safeMessage);
  }

  return deps.redirectFn(`${url.pathname}${url.search}`);
}
