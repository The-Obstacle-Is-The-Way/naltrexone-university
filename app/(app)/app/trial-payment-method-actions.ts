'use server';

import { redirect } from 'next/navigation';
import { logger as appLogger } from '@/lib/logger';
import { ROUTES } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createTrialPaymentMethodSetupSession } from '@/src/adapters/controllers/billing-controller';

type CreateSessionFn = (input: {
  idempotencyKey?: string;
}) => Promise<ActionResult<{ url: string }>>;

export type TrialPaymentMethodActionDeps = {
  createSessionFn: CreateSessionFn;
  redirectFn: (url: string) => never;
};

function getDeps(
  deps?: Partial<TrialPaymentMethodActionDeps>,
): TrialPaymentMethodActionDeps {
  return {
    createSessionFn:
      deps?.createSessionFn ?? createTrialPaymentMethodSetupSession,
    redirectFn: deps?.redirectFn ?? redirect,
  };
}

export async function createTrialPaymentMethodAction(
  formData: FormData,
  deps?: Partial<TrialPaymentMethodActionDeps>,
): Promise<void> {
  const d = getDeps(deps);
  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;
  const result = await d.createSessionFn(
    idempotencyKey ? { idempotencyKey } : {},
  );

  if (result.ok) return d.redirectFn(result.data.url);
  if (result.error.code === 'UNAUTHENTICATED') {
    return d.redirectFn(ROUTES.SIGN_UP);
  }

  try {
    appLogger.error(
      { errorCode: result.error.code },
      'Trial payment-method setup failed',
    );
  } catch {
    // Logging must not replace the safe redirect.
  }
  return d.redirectFn(
    `${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
  );
}
