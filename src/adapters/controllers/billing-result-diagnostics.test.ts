import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCreateTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-action-handler';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import { logger } from '@/lib/logger';
import { ApplicationError } from '@/src/application/errors';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createSerializedLogger } from '@/tests/shared/serialized-logger';
import { handleError } from './action-result';
import { createPortalSession } from './billing-controller';
import { createBillingControllerDeps } from './test-helpers/billing-controller-deps';

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
  // The controller leaves an expected refusal unlogged, so the action's own
  // log is its only record (BUG-348).
  it('logs a checkout refusal the controller leaves unlogged, once', async () => {
    const serialized = createSerializedLogger();
    const logError = vi.fn();
    await expect(
      runSubscribeAction(
        { plan: 'monthly', idempotencyKey: 'idem_1', renewalOptIn: true },
        {
          createCheckoutSessionFn: async () =>
            handleError(new ApplicationError('CONFLICT', 'private'), {
              logger: serialized.logger,
            }),
          redirectFn: () => {
            throw new Error('redirect');
          },
          logError,
        },
      ),
    ).rejects.toThrow('redirect');
    expect(serialized.lines).toHaveLength(0);
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      { plan: 'monthly', idempotencyKeyLength: 6, errorCode: 'CONFLICT' },
      'Stripe checkout failed',
    );
  });
  it('logs an add-card refusal the controller leaves unlogged, once', async () => {
    const log = vi.spyOn(logger, 'error');
    const serialized = createSerializedLogger();
    const form = new FormData();
    form.set('disclosureVersion', '2026-09-28.2');
    form.set('renewalOptIn', 'yes');
    await expect(
      executeCreateTrialPaymentMethodAction(form, {
        createSessionFn: async () =>
          handleError(new ApplicationError('NOT_FOUND', 'private'), {
            logger: serialized.logger,
          }),
        redirectFn: () => {
          throw new Error('redirect');
        },
      }),
    ).rejects.toThrow('redirect');
    expect(serialized.lines).toHaveLength(0);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      { errorCode: 'NOT_FOUND' },
      'Trial payment-method setup failed',
    );
  });
  // An operational portal failure is logged once by the real action, naming
  // it, so the redirect that follows is not a silent failure.
  it('logs an operational portal failure once with its action name', async () => {
    const logger = new FakeLogger();
    const deps = createBillingControllerDeps({
      portalThrows: new ApplicationError('STRIPE_ERROR', 'private detail'),
    });

    const result = await createPortalSession({}, deps, { logger });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'STRIPE_ERROR' },
    });
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]?.context).toMatchObject({
      action: 'billing:createPortalSession',
      err: { code: 'STRIPE_ERROR' },
    });
    expect(JSON.stringify(logger.errorCalls)).not.toContain('private detail');
  });
});
