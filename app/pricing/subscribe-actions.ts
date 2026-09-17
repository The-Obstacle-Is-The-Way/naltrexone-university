'use server';

import { redirect } from 'next/navigation';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import { toPricingRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createCheckoutSession } from '@/src/adapters/controllers/billing-controller';
import type { CreateCheckoutSessionInput } from '@/src/application/use-cases';

type CreateCheckoutSessionFn = (
  input: Pick<
    CreateCheckoutSessionInput,
    'plan' | 'idempotencyKey' | 'expectedOffer'
  >,
) => Promise<ActionResult<{ url: string }>>;

export type SubscribeActionsDeps = {
  createCheckoutSessionFn: CreateCheckoutSessionFn;
  redirectFn: (url: string) => never;
  logError?: (context: Record<string, unknown>, msg: string) => void;
};

type ResolvedSubscribeActionsDeps = Omit<SubscribeActionsDeps, 'logError'> & {
  logError: NonNullable<SubscribeActionsDeps['logError']>;
};

async function getDeps(
  deps?: Partial<SubscribeActionsDeps>,
): Promise<ResolvedSubscribeActionsDeps> {
  const ctx = createRequestContext();
  const requestLogger = getRequestLogger(ctx);

  const createCheckoutSessionFn: CreateCheckoutSessionFn =
    deps?.createCheckoutSessionFn ??
    ((input) =>
      createCheckoutSession(input, undefined, { logger: requestLogger }));

  return {
    createCheckoutSessionFn,
    redirectFn: deps?.redirectFn ?? redirect,
    logError:
      deps?.logError ??
      ((context: Record<string, unknown>, msg: string) =>
        requestLogger.error(context, msg)),
  };
}

async function subscribeToPlan(
  plan: 'monthly' | 'annual',
  formData: FormData,
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  const d = await getDeps(deps);
  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;
  const disclosureVersion = formData.get('disclosureVersion');
  const hasTrial = formData.get('hasTrial');
  if (
    typeof disclosureVersion !== 'string' ||
    !disclosureVersion ||
    (hasTrial !== 'true' && hasTrial !== 'false')
  ) {
    return d.redirectFn(toPricingRoute({ checkout: 'error', plan }));
  }

  return runSubscribeAction(
    {
      plan,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      expectedOffer: { disclosureVersion, hasTrial: hasTrial === 'true' },
    },
    d,
  );
}

export async function subscribeMonthlyAction(
  formData: FormData,
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  return subscribeToPlan('monthly', formData, deps);
}

export async function subscribeAnnualAction(
  formData: FormData,
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  return subscribeToPlan('annual', formData, deps);
}
