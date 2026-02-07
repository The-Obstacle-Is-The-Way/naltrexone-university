import { ROUTES } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

type RedirectFn = (url: string) => never;

type LogErrorFn = (context: Record<string, unknown>, msg: string) => void;

type SubscribeActionInput = {
  plan: 'monthly' | 'annual';
  idempotencyKey?: string;
};

type SubscribeActionDeps = {
  createCheckoutSessionFn: (
    input: SubscribeActionInput,
  ) => Promise<ActionResult<{ url: string }>>;
  redirectFn: RedirectFn;
  logError?: LogErrorFn;
};

export async function runSubscribeAction(
  input: SubscribeActionInput,
  deps: SubscribeActionDeps,
): Promise<void> {
  const result = await deps.createCheckoutSessionFn({
    plan: input.plan,
    idempotencyKey: input.idempotencyKey,
  });
  if (result.ok) return deps.redirectFn(result.data.url);

  if (result.error.code === 'UNAUTHENTICATED') {
    return deps.redirectFn(ROUTES.SIGN_UP);
  }

  if (result.error.code === 'ALREADY_SUBSCRIBED') {
    return deps.redirectFn(`${ROUTES.PRICING}?reason=manage_billing`);
  }

  if (result.error.code === 'RATE_LIMITED') {
    return deps.redirectFn(`${ROUTES.PRICING}?checkout=rate_limited`);
  }

  deps.logError?.(
    {
      plan: input.plan,
      idempotencyKey: input.idempotencyKey,
      errorCode: result.error.code,
      errorMessage: result.error.message,
    },
    'Stripe checkout failed',
  );

  const url = new URL(ROUTES.PRICING, 'https://example.com');
  url.searchParams.set('checkout', 'error');
  url.searchParams.set('plan', input.plan);
  url.searchParams.set('error_code', result.error.code);

  if (process.env.NODE_ENV === 'development') {
    const rawMessage = result.error.message;
    const safeMessage =
      rawMessage.length > 200 ? `${rawMessage.slice(0, 200)}…` : rawMessage;
    url.searchParams.set('error_message', safeMessage);
  }

  return deps.redirectFn(`${url.pathname}${url.search}`);
}
