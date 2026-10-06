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
  logWarn?: LogErrorFn;
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

  // BUG-325: never the caller's text, only the key's length; the messages are
  // the app's own. A refused input is the caller's mistake, a forgery, or an
  // offer that changed since the page loaded, so it is a warning, not a
  // checkout failure.
  const context = {
    plan: input.plan,
    idempotencyKeyLength: input.idempotencyKey?.length ?? null,
    errorCode: result.error.code,
    errorMessage: result.error.message,
  };
  if (result.error.code === 'VALIDATION_ERROR') {
    deps.logWarn?.(context, 'Stripe checkout refused its input');
  } else {
    deps.logError?.(context, 'Stripe checkout failed');
  }

  return deps.redirectFn(
    toPricingRoute({ checkout: 'error', plan: input.plan }),
  );
}
