import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logger as appLogger } from '@/lib/logger';
import { ROUTES } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createTrialPaymentMethodSetupSession } from '@/src/adapters/controllers/billing-controller';
import { zUuid } from '@/src/adapters/shared/zod-schemas';

type CreateSessionFn = (input: {
  idempotencyKey?: string;
}) => Promise<ActionResult<{ url: string }>>;

export type TrialPaymentMethodActionDeps = {
  createSessionFn: CreateSessionFn;
  redirectFn: (url: string) => never;
};

const TrialPaymentMethodActionInputSchema = z
  .object({ idempotencyKey: zUuid.optional() })
  .strict();

const defaultDeps: TrialPaymentMethodActionDeps = {
  createSessionFn: createTrialPaymentMethodSetupSession,
  redirectFn: redirect,
};

export async function executeCreateTrialPaymentMethodAction(
  formData: FormData,
  deps: TrialPaymentMethodActionDeps = defaultDeps,
): Promise<void> {
  const rawKey = formData.get('idempotencyKey');
  const parsed = TrialPaymentMethodActionInputSchema.safeParse({
    idempotencyKey:
      typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : undefined,
  });
  if (!parsed.success) {
    return deps.redirectFn(
      `${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
    );
  }

  const result = await deps.createSessionFn(
    parsed.data.idempotencyKey
      ? { idempotencyKey: parsed.data.idempotencyKey }
      : {},
  );
  if (result.ok) return deps.redirectFn(result.data.url);
  if (result.error.code === 'UNAUTHENTICATED') {
    return deps.redirectFn(ROUTES.SIGN_UP);
  }

  try {
    appLogger.error(
      { errorCode: result.error.code },
      'Trial payment-method setup failed',
    );
  } catch {
    // Logging must not replace the safe redirect.
  }
  return deps.redirectFn(
    `${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
  );
}
