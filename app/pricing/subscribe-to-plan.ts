// The subscribe actions' logic, outside the 'use server' module so a client
// cannot reach its test seams: an exported server action takes only its form
// data, because a client can call one with any arguments.
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
  > & { renewalOptIn: true },
) => Promise<ActionResult<{ url: string }>>;

export type SubscribeActionsDeps = {
  createCheckoutSessionFn: CreateCheckoutSessionFn;
  redirectFn: (url: string) => never;
  logError?: (context: Record<string, unknown>, msg: string) => void;
  logWarn?: (context: Record<string, unknown>, msg: string) => void;
};

type ResolvedSubscribeActionsDeps = Omit<
  SubscribeActionsDeps,
  'logError' | 'logWarn'
> & {
  logError: NonNullable<SubscribeActionsDeps['logError']>;
  logWarn: NonNullable<SubscribeActionsDeps['logWarn']>;
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
    logWarn:
      deps?.logWarn ??
      ((context: Record<string, unknown>, msg: string) =>
        requestLogger.warn(context, msg)),
  };
}

export async function subscribeToPlan(
  plan: 'monthly' | 'annual',
  formData: FormData,
  deps?: Partial<SubscribeActionsDeps>,
): Promise<void> {
  const d = await getDeps(deps);
  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;
  const disclosureVersion = formData.get('disclosureVersion');
  const hasTrial = formData.get('hasTrial');
  // DEBT-414 F03: the separate renewal opt-in, required here as well as by
  // the browser.
  const renewalOptIn = formData.get('renewalOptIn');
  if (
    typeof disclosureVersion !== 'string' ||
    !disclosureVersion ||
    (hasTrial !== 'true' && hasTrial !== 'false') ||
    renewalOptIn !== 'yes'
  ) {
    return d.redirectFn(toPricingRoute({ checkout: 'error', plan }));
  }

  return runSubscribeAction(
    {
      plan,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      expectedOffer: { disclosureVersion, hasTrial: hasTrial === 'true' },
      renewalOptIn: true,
    },
    d,
  );
}
