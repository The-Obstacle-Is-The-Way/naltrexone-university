import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runManageBillingAction } from '@/lib/manage-billing/manage-billing-core';
import { createStripePortalSession } from '@/src/adapters/gateways/stripe/stripe-portal';
import { callStripeWithRetry } from '@/src/adapters/gateways/stripe/stripe-retry';
import { FakeStripeCheckoutClient } from '@/src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client';
import { ApplicationError } from '@/src/application/errors';
import { createSerializedLogger } from '@/tests/shared/serialized-logger';
import { createAction } from './create-action';

vi.mock('server-only', () => ({}));
let handleError: typeof import('./action-result').handleError;
beforeAll(async () => {
  ({ handleError } = await import('./action-result'));
});

describe('operational action diagnostics', () => {
  it.each(['STRIPE_ERROR', 'INTERNAL_ERROR'] as const)(
    'logs %s once with preserved cause diagnostics and no raw text',
    (code) => {
      const { logger, lines } = createSerializedLogger();
      const error = new ApplicationError(
        code,
        'private outer message',
        undefined,
        {
          cause: Object.assign(new Error('private SQL parameters'), {
            code: '23505',
            constraint: 'safe_constraint',
          }),
        },
      );
      handleError(error, { logger });
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        err: { code, sqlState: '23505', constraint: 'safe_constraint' },
      });
      expect(lines.join('')).not.toContain('private');
    },
  );
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it.each(['missing URL', 'open circuit'] as const)(
    'logs the actual portal failure once before redirect: %s',
    async (failure) => {
      const { logger, lines } = createSerializedLogger();
      const stripe = new FakeStripeCheckoutClient();
      stripe.portalConfigurations.seed({
        metadata: {
          app_portal_profile: 'paid',
          app_portal_version: '2026-09-28',
        },
      });
      if (failure === 'missing URL') {
        // Shape-only fault: Stripe returning no URL is not provider behavior.
        vi.spyOn(stripe.billingPortal.sessions, 'create').mockResolvedValue({
          url: null,
        });
      } else {
        for (let i = 0; i < 5; i++) {
          await expect(
            callStripeWithRetry({
              operation: 'test.outage',
              logger,
              fn: async () => {
                throw Object.assign(new Error('private provider response'), {
                  type: 'StripeConnectionError',
                });
              },
            }),
          ).rejects.toThrow('private provider response');
        }
      }
      const action = createAction({
        action: 'billing:createPortalSession',
        schema: z.object({}),
        getDeps: async () => ({}),
        execute: () =>
          createStripePortalSession({
            stripe,
            logger,
            input: {
              externalCustomerId: 'cus_test',
              returnUrl: 'https://app.test/billing',
              profile: 'paid',
            },
          }),
      });
      await expect(
        runManageBillingAction({
          createPortalSessionFn: (input) =>
            action(input, undefined, { logger }),
          logger,
          redirects: { failure: '/failure' },
          redirectFn: () => {
            throw new Error('redirect');
          },
        }),
      ).rejects.toThrow('redirect');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '')).toMatchObject({
        action: 'billing:createPortalSession',
        err: { code: 'STRIPE_ERROR' },
      });
      expect(lines.join('')).not.toContain('private');
      expect(lines.join('')).not.toContain(
        'Stripe Billing Portal Session URL is missing',
      );
    },
  );
  it('projects a thrown portal error before the fallback redirect', async () => {
    const { logger, lines } = createSerializedLogger();
    await expect(
      runManageBillingAction({
        createPortalSessionFn: async () => {
          throw new Error('private portal URL');
        },
        logger,
        redirects: { failure: '/failure' },
        redirectFn: () => {
          throw new Error('redirect');
        },
      }),
    ).rejects.toThrow('redirect');
    expect(lines).toHaveLength(1);
    expect(lines.join('')).not.toContain('private portal URL');
  });
});
