'use server';

import { redirect } from 'next/navigation';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createCheckoutSession } from '@/src/adapters/controllers/billing-controller';

type CreateCheckoutSessionFn = (input: {
  plan: 'monthly' | 'annual';
  idempotencyKey?: string;
}) => Promise<ActionResult<{ url: string }>>;

export type SubscribeActionsDeps = {
  createCheckoutSessionFn: CreateCheckoutSessionFn;
  redirectFn: (url: string) => never;
  logError?: (context: Record<string, unknown>, msg: string) => void;
};

async function getDeps(
  deps?: Partial<SubscribeActionsDeps>,
): Promise<SubscribeActionsDeps> {
  const createCheckoutSessionFn: CreateCheckoutSessionFn =
    deps?.createCheckoutSessionFn ?? createCheckoutSession;

  return {
    createCheckoutSessionFn,
    redirectFn: deps?.redirectFn ?? redirect,
    logError:
      deps?.logError ??
      (() => {
        const ctx = createRequestContext();
        const logger = getRequestLogger(ctx);
        return (context: Record<string, unknown>, msg: string) =>
          logger.error(context, msg);
      })(),
  };
}

export async function subscribeMonthlyAction(
  formData: FormData,
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  const d = await getDeps(deps);
  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;

  return runSubscribeAction(
    { plan: 'monthly', idempotencyKey },
    {
      createCheckoutSessionFn: d.createCheckoutSessionFn,
      redirectFn: d.redirectFn,
      logError: d.logError,
    },
  );
}

export async function subscribeAnnualAction(
  formData: FormData,
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  const d = await getDeps(deps);
  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;

  return runSubscribeAction(
    { plan: 'annual', idempotencyKey },
    {
      createCheckoutSessionFn: d.createCheckoutSessionFn,
      redirectFn: d.redirectFn,
      logError: d.logError,
    },
  );
}
