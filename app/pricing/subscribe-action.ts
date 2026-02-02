import type { ActionResult } from '@/src/adapters/controllers/action-result';

type RedirectFn = (url: string) => never;

type SubscribeActionInput = {
  plan: 'monthly' | 'annual';
};

type SubscribeActionDeps = {
  createCheckoutSessionFn: (
    input: SubscribeActionInput,
  ) => Promise<ActionResult<{ url: string }>>;
  redirectFn: RedirectFn;
};

export async function runSubscribeAction(
  input: SubscribeActionInput,
  deps: SubscribeActionDeps,
): Promise<void> {
  const result = await deps.createCheckoutSessionFn({ plan: input.plan });
  if (result.ok) return deps.redirectFn(result.data.url);

  if (result.error.code === 'UNAUTHENTICATED') {
    return deps.redirectFn('/sign-up');
  }

  return deps.redirectFn('/pricing?checkout=error');
}
