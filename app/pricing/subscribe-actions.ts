'use server';

import { redirect } from 'next/navigation';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { runSubscribeAction } from './subscribe-action';

type CreateCheckoutSessionFn = (input: {
  plan: 'monthly' | 'annual';
}) => Promise<ActionResult<{ url: string }>>;

export type SubscribeActionsDeps = {
  createCheckoutSessionFn: CreateCheckoutSessionFn;
  redirectFn: (url: string) => never;
};

async function getDeps(
  deps?: Partial<SubscribeActionsDeps>,
): Promise<SubscribeActionsDeps> {
  const createCheckoutSessionFn: CreateCheckoutSessionFn =
    deps?.createCheckoutSessionFn ??
    (await import('@/src/adapters/controllers/billing-controller'))
      .createCheckoutSession;

  return {
    createCheckoutSessionFn,
    redirectFn: deps?.redirectFn ?? redirect,
  };
}

export async function subscribeMonthlyAction(
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  const d = await getDeps(deps);
  return runSubscribeAction(
    { plan: 'monthly' },
    {
      createCheckoutSessionFn: d.createCheckoutSessionFn,
      redirectFn: d.redirectFn,
    },
  );
}

export async function subscribeAnnualAction(
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  const d = await getDeps(deps);
  return runSubscribeAction(
    { plan: 'annual' },
    {
      createCheckoutSessionFn: d.createCheckoutSessionFn,
      redirectFn: d.redirectFn,
    },
  );
}
