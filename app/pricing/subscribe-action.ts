import { toPricingRoute, toSignUpRedirectRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { CreateCheckoutSessionInput } from '@/src/application/use-cases';

type RedirectFn = (url: string) => never;

type LogErrorFn = (context: Record<string, unknown>, msg: string) => void;

type SubscribeActionInput = Pick<
  CreateCheckoutSessionInput,
  'plan' | 'idempotencyKey' | 'expectedOffer'
> & { renewalOptIn: true };

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
    ...(input.expectedOffer ? { expectedOffer: input.expectedOffer } : {}),
    renewalOptIn: input.renewalOptIn,
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

  // BUG-321: the checkout's sync has recorded what Stripe holds, so the page
  // shows it from the database; this parameter only adds a notice when the
  // record is still missing.
  if (result.error.code === 'ALREADY_SUBSCRIBED') {
    return deps.redirectFn(toPricingRoute({ checkout: 'already_subscribed' }));
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
