// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import { createUser } from '@/src/domain/test-helpers';
import {
  createCheckoutSession,
  createTrialPaymentMethodSetupSession,
} from './billing-controller';
import { createBillingControllerDeps } from './test-helpers/billing-controller-deps';

// DEBT-503 item 1: pages read the stored email, but Stripe customer creation
// and card setup send it outside the app, so they ask Clerk for the current
// one. They ask only when they are about to create a session: a refused or
// replayed request spends none of Clerk's allowance.

const expectedOffer = {
  hasTrial: false,
  disclosureVersion: '2026-09-28.2',
} as const;

function users() {
  const stored = createUser({ email: 'stored@example.com' });
  return { stored, fresh: { ...stored, email: 'fresh@example.com' } };
}

describe('billing reads the current email before Stripe', () => {
  it('sends checkout the email Clerk confirms', async () => {
    const { stored, fresh } = users();
    const deps = createBillingControllerDeps({
      user: stored,
      currentEmailUser: fresh,
    });

    await createCheckoutSession(
      { plan: 'monthly', expectedOffer, renewalOptIn: true },
      deps,
    );

    expect(deps.createCheckoutSessionUseCase.inputs).toMatchObject([
      { userId: stored.id, email: 'fresh@example.com' },
    ]);
  });

  it('sends card setup the email Clerk confirms', async () => {
    const { stored, fresh } = users();
    const deps = createBillingControllerDeps({
      user: stored,
      currentEmailUser: fresh,
    });

    await createTrialPaymentMethodSetupSession(
      { expectedDisclosureVersion: '2026-09-28.2', renewalOptIn: true },
      deps,
    );

    expect(
      deps.createTrialPaymentMethodSetupSessionUseCase.inputs,
    ).toMatchObject([{ userId: stored.id, email: 'fresh@example.com' }]);
  });

  it('asks Clerk nothing when the rate limit refuses', async () => {
    const deps = createBillingControllerDeps({
      rateLimiter: new FakeRateLimiter({
        success: false,
        limit: 10,
        remaining: 0,
        retryAfterSeconds: 60,
      }),
    });

    await createCheckoutSession(
      { plan: 'monthly', expectedOffer, renewalOptIn: true },
      deps,
    );

    expect(deps.authGateway.requireUserCalls).toEqual([{}]);
  });

  it('asks Clerk nothing for a replayed checkout', async () => {
    const deps = createBillingControllerDeps();
    const input = {
      plan: 'monthly',
      expectedOffer,
      renewalOptIn: true,
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    } as const;

    await createCheckoutSession(input, deps);
    await createCheckoutSession(input, deps);

    expect(deps.authGateway.requireUserCalls).toEqual([
      {},
      { currentEmail: true },
      {},
    ]);
  });

  it('refuses when the refreshed account is a different user', async () => {
    const { stored } = users();
    const deps = createBillingControllerDeps({
      user: stored,
      currentEmailUser: createUser({ email: 'other@example.com' }),
    });

    const result = await createCheckoutSession(
      { plan: 'monthly', expectedOffer, renewalOptIn: true },
      deps,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
  });
});
