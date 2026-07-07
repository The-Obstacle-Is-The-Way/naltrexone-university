import { toPricingRoute, toSignUpRedirectRoute } from '@/lib/routes';
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
    ...(input.idempotencyKey !== undefined
      ? { idempotencyKey: input.idempotencyKey }
      : {}),
  });
  if (result.ok) return deps.redirectFn(result.data.url);

  if (result.error.code === 'UNAUTHENTICATED') {
    return deps.redirectFn(
      toSignUpRedirectRoute(toPricingRoute({ plan: input.plan })),
    );
  }

  if (result.error.code === 'ALREADY_SUBSCRIBED') {
    return deps.redirectFn(toPricingRoute({ reason: 'manage_billing' }));
  }

  if (result.error.code === 'RATE_LIMITED') {
    return deps.redirectFn(toPricingRoute({ checkout: 'rate_limited' }));
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

  return deps.redirectFn(
    toPricingRoute({ checkout: 'error', plan: input.plan }),
  );
}
