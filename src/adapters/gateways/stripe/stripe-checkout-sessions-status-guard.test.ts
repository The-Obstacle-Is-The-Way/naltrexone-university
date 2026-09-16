import { describe, expect, it } from 'vitest';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeCheckoutSessionResponseStatus } from '@/src/adapters/shared/stripe-types';
import type { CheckoutSessionInput } from '@/src/application/ports/gateways';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const PRICE_IDS: StripePriceIds = {
  monthly: 'price_monthly',
  annual: 'price_annual',
};

type StatusGuardHarness = {
  stripe: FakeStripeCheckoutClient;
  input: CheckoutSessionInput;
  logger: FakeLogger;
  nowMs: () => number;
  advanceOneSecond: () => void;
};

function createHarness(): StatusGuardHarness {
  let currentNowMs = Date.UTC(2026, 8, 16, 12, 0, 0);
  return {
    stripe: new FakeStripeCheckoutClient(() => currentNowMs),
    input: {
      userId: crypto.randomUUID(),
      externalCustomerId: 'cus_status_guard',
      ...createTestRenewalTerms('monthly'),
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    },
    logger: new FakeLogger(),
    nowMs: () => currentNowMs,
    advanceOneSecond: () => {
      currentNowMs += 1_000;
    },
  };
}

async function createCheckout(
  harness: StatusGuardHarness,
): Promise<{ url: string }> {
  return createStripeCheckoutSession({
    stripe: harness.stripe,
    input: harness.input,
    priceIds: PRICE_IDS,
    logger: harness.logger,
    nowMs: harness.nowMs,
  });
}

// Stripe types every response enum as `known | OtherString`, so the adapter
// port admits statuses this SDK does not know yet. Only a live 'open' status
// may keep an existing Session in use; anything else is not reusable.
async function expectExistingSessionNotReused(
  liveStatus: StripeCheckoutSessionResponseStatus,
): Promise<void> {
  const harness = createHarness();
  const first = await createCheckout(harness);
  harness.stripe.setRetrieveOverride((session) =>
    session.id === 'cs_fake_1' ? { ...session, status: liveStatus } : session,
  );
  harness.advanceOneSecond();

  const second = await createCheckout(harness);

  // The deterministic key replays cs_fake_1; the adapter must then recover
  // with the cs_fake_1 recovery key instead of handing back the replayed URL.
  expect(second.url).not.toBe(first.url);
  expect(harness.stripe.createCalls.at(-1)?.options?.idempotencyKey).toBe(
    `checkout_session_recovery:${harness.input.userId}:monthly:cs_fake_1`,
  );
  await expect(
    harness.stripe.checkout.sessions.retrieve('cs_fake_2'),
  ).resolves.toMatchObject({ status: 'open', url: second.url });
}

describe('createStripeCheckoutSession live status guard', () => {
  it('reuses an existing same-price Session whose live status is open', async () => {
    const harness = createHarness();
    const first = await createCheckout(harness);
    harness.advanceOneSecond();

    const second = await createCheckout(harness);

    expect(second.url).toBe(first.url);
    expect(harness.stripe.createCalls).toHaveLength(1);
  });

  it('does not reuse an existing same-price Session whose live status is an empty string', async () => {
    await expectExistingSessionNotReused('');
  });

  it('does not reuse an existing same-price Session whose live status is unknown to this SDK', async () => {
    await expectExistingSessionNotReused('future_status');
  });
});
