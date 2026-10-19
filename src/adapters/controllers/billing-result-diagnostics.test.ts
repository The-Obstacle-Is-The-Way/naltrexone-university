import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCreateTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-action-handler';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import { logger } from '@/lib/logger';
import { ApplicationError } from '@/src/application/errors';
import { createSerializedLogger } from '@/tests/shared/serialized-logger';
import { handleError } from './action-result';

vi.mock('server-only', () => ({}));

describe('billing result diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('does not log an operational checkout failure again after the controller', async () => {
    const serialized = createSerializedLogger();
    await expect(
      runSubscribeAction(
        { plan: 'monthly', renewalOptIn: true },
        {
          createCheckoutSessionFn: async () =>
            handleError(new ApplicationError('STRIPE_ERROR', 'private'), {
              logger: serialized.logger,
            }),
          redirectFn: () => {
            throw new Error('redirect');
          },
          logError: serialized.logger.error.bind(serialized.logger),
        },
      ),
    ).rejects.toThrow('redirect');
    expect(serialized.lines).toHaveLength(1);
  });
  it('does not log an operational add-card failure again after the controller', async () => {
    const log = vi.spyOn(logger, 'error');
    const serialized = createSerializedLogger();
    const form = new FormData();
    form.set('disclosureVersion', '2026-09-28.2');
    form.set('renewalOptIn', 'yes');
    await expect(
      executeCreateTrialPaymentMethodAction(form, {
        createSessionFn: async () =>
          handleError(new ApplicationError('STRIPE_ERROR', 'private'), {
            logger: serialized.logger,
          }),
        redirectFn: () => {
          throw new Error('redirect');
        },
      }),
    ).rejects.toThrow('redirect');
    expect(serialized.lines).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
  });
});
