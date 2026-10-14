import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

// BUG-343: a Checkout completed while another request for the same customer
// is between its subscription check and its own Session must not leave that
// request handing back a second completable Session. Stripe refuses to expire
// a Session that is not open, with an error whose text is not a contract, so
// the adapter settles a refused expire by the Session's status.
describe('createStripeCheckoutSession when a Checkout completes in flight', () => {
  const customer = 'cus_in_flight';
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: customer,
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const trialInput = {
    ...input,
    ...createTestRenewalTerms('monthly', true),
    trialPeriodDays: 7,
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const fixedNowMs = 1_700_000_000_000;
  let logger: FakeLogger;
  let operationalAlerts: FakeOperationalAlerts;

  beforeEach(() => {
    logger = new FakeLogger();
    operationalAlerts = new FakeOperationalAlerts();
  });

  function createFake(): FakeStripeCheckoutClient {
    return new FakeStripeCheckoutClient(() => fixedNowMs);
  }

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
    checkoutInput: typeof input | typeof trialInput = input,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input: checkoutInput,
      priceIds,
      logger,
      operationalAlerts,
      nowMs: () => fixedNowMs,
    });
  }

  function sessionIdOf(url: string): string {
    return url.slice(url.lastIndexOf('/') + 1);
  }

  // What a completed Checkout leaves behind: the Session complete, and a
  // live Subscription on the customer.
  function completeCheckout(
    stripe: FakeStripeCheckoutClient,
    sessionId: string,
    status: 'trialing' | 'active',
  ): void {
    stripe.markComplete(sessionId, `sub_${sessionId}`);
    stripe.seedSubscription({ id: `sub_${sessionId}`, customer, status });
  }

  async function openSessionIds(
    stripe: FakeStripeCheckoutClient,
  ): Promise<string[]> {
    const open = await stripe.checkout.sessions.list({
      customer,
      status: 'open',
      limit: 100,
    });
    return open.data.map((session) => session.id);
  }

  it.each([
    ['a first checkout with a trial', trialInput, 'trialing'],
    ['a returning customer', input, 'active'],
  ] as const)(
    'refuses %s with ALREADY_SUBSCRIBED and leaves no open Session when the first Checkout completes after the subscription check',
    async (_label, checkoutInput, status) => {
      const stripe = createFake();
      const first = sessionIdOf(
        (await createCheckout(stripe, checkoutInput)).url,
      );
      // The second request's open-Session listing comes after its subscription
      // check, so completing the first Checkout there is interleaving 1.
      let completed = false;
      stripe.setListHook(() => {
        if (completed) return;
        completed = true;
        completeCheckout(stripe, first, status);
      });

      await expect(createCheckout(stripe, checkoutInput)).rejects.toMatchObject(
        {
          code: 'ALREADY_SUBSCRIBED',
        },
      );

      expect(await openSessionIds(stripe)).toEqual([]);
    },
  );

  it('refuses with ALREADY_SUBSCRIBED when the Session it expires for another plan completed first', async () => {
    const stripe = createFake();
    const annual = sessionIdOf(
      (
        await createCheckout(stripe, {
          ...input,
          ...createTestRenewalTerms('annual'),
        })
      ).url,
    );
    // Interleaving 3: the annual Session completes just before the monthly
    // request expires it, so Stripe refuses the expire.
    stripe.setExpireFault((sessionId) => {
      if (sessionId === annual) completeCheckout(stripe, annual, 'active');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(await openSessionIds(stripe)).toEqual([]);
  });

  it('refuses with ALREADY_SUBSCRIBED when the Session it could not inspect completed before its expire', async () => {
    const stripe = createFake();
    const first = sessionIdOf((await createCheckout(stripe)).url);
    // Interleaving 4: the inspection fails, so the expire is not fatal, and
    // the Session completes before it.
    let inspected = false;
    stripe.setRetrieveOverride((session) => {
      if (session.id === first && !inspected) {
        inspected = true;
        throw new Error('retrieve failed');
      }
      return session;
    });
    stripe.setExpireFault((sessionId) => {
      if (sessionId === first && stripe.expireCalls.length === 1) {
        completeCheckout(stripe, first, 'active');
      }
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(await openSessionIds(stripe)).toEqual([]);
  });

  it('continues when the Session it expires for another plan has already expired', async () => {
    const stripe = createFake();
    const annual = sessionIdOf(
      (
        await createCheckout(stripe, {
          ...input,
          ...createTestRenewalTerms('annual'),
        })
      ).url,
    );
    stripe.setExpireFault((sessionId) => {
      if (sessionId === annual) stripe.markExpired(annual);
    });

    const monthly = await createCheckout(stripe);

    expect(await openSessionIds(stripe)).toEqual([sessionIdOf(monthly.url)]);
  });

  it('keeps an expire failure when the Session it expires cannot be read', async () => {
    const stripe = createFake();
    const annual = sessionIdOf(
      (
        await createCheckout(stripe, {
          ...input,
          ...createTestRenewalTerms('annual'),
        })
      ).url,
    );
    stripe.setExpireFault(() => {
      throw new Error('expire failed');
    });
    // The first read is the inspection; the second would settle the refused
    // expire, and fails, so the expire's failure stands.
    let reads = 0;
    stripe.setRetrieveOverride((session) => {
      if (session.id === annual && ++reads === 2) {
        throw new Error('retrieve failed');
      }
      return session;
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to expire existing checkout session',
    });
  });

  it('keeps its new Session when a superseded one has already expired', async () => {
    const stripe = createFake();
    const annual = sessionIdOf(
      (
        await createCheckout(stripe, {
          ...input,
          ...createTestRenewalTerms('annual'),
        })
      ).url,
    );
    // The pre-create inspection fails, so the reconcile expires the annual
    // Session after the create; it has already expired by then.
    let inspected = false;
    stripe.setRetrieveOverride((session) => {
      if (session.id === annual && !inspected) {
        inspected = true;
        throw new Error('retrieve failed');
      }
      return session;
    });
    stripe.setExpireFault((sessionId) => {
      if (sessionId !== annual) return;
      if (stripe.expireCalls.length === 1) throw new Error('expire failed');
      stripe.markExpired(annual);
    });

    const monthly = await createCheckout(stripe);

    expect(await openSessionIds(stripe)).toEqual([sessionIdOf(monthly.url)]);
  });

  // The re-check's listing is the request's second; a case stages what
  // completes there.
  function onRecheck(
    stripe: FakeStripeCheckoutClient,
    stage: () => Promise<void>,
  ) {
    let checks = 0;
    stripe.setSubscriptionListHook(async () => {
      checks += 1;
      if (checks === 2) await stage();
    });
  }

  it('warns and refuses when the Session it would hand back completed during the re-check with the only live subscription', async () => {
    const stripe = createFake();
    onRecheck(stripe, async () => {
      const [created] = await openSessionIds(stripe);
      if (created) completeCheckout(stripe, created, 'active');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(logger.warnCalls).toContainEqual(
      expect.objectContaining({
        msg: 'Checkout session completed during the subscription re-check',
      }),
    );
    expect(logger.errorCalls).toEqual([]);
  });

  it('logs an error when the Session it would hand back completed while another live subscription existed', async () => {
    const stripe = createFake();
    onRecheck(stripe, async () => {
      stripe.seedSubscription({ id: 'sub_other', customer, status: 'active' });
      const [created] = await openSessionIds(stripe);
      if (created) completeCheckout(stripe, created, 'active');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(logger.errorCalls).toContainEqual(
      expect.objectContaining({
        msg: 'Checkout session completed while another live subscription existed',
      }),
    );
  });

  // BUG-343 option 5.
  it('raises a duplicate-subscription alert when the Session it would hand back completed beside another live subscription', async () => {
    const stripe = createFake();
    onRecheck(stripe, async () => {
      stripe.seedSubscription({ id: 'sub_other', customer, status: 'active' });
      const [created] = await openSessionIds(stripe);
      if (created) completeCheckout(stripe, created, 'active');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(operationalAlerts.raised).toEqual([
      { kind: 'stripe_duplicate_subscription', count: 1 },
    ]);
  });

  it('raises no alert when the Session completed during the re-check holds the only live subscription', async () => {
    const stripe = createFake();
    onRecheck(stripe, async () => {
      const [created] = await openSessionIds(stripe);
      if (created) completeCheckout(stripe, created, 'active');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(operationalAlerts.raised).toEqual([]);
  });

  it('still refuses with ALREADY_SUBSCRIBED, and logs an error, when the re-check cannot expire the Session', async () => {
    const stripe = createFake();
    onRecheck(stripe, async () => {
      stripe.seedSubscription({ id: 'sub_other', customer, status: 'active' });
      stripe.setExpireFault(() => {
        throw new Error('expire failed');
      });
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(logger.errorCalls).toContainEqual(
      expect.objectContaining({
        msg: 'Failed to expire checkout session after a subscription appeared',
      }),
    );
  });

  it('refuses with ALREADY_SUBSCRIBED instead of reusing an open Session when another completed after the subscription check', async () => {
    const stripe = createFake();
    const reusable = sessionIdOf((await createCheckout(stripe)).url);
    // A second open Session on the same terms, newer, as a failed reconcile
    // can leave: it completes after the next request's subscription check,
    // so that request's listing returns the older one to reuse.
    const params = stripe.createCalls[0]?.params;
    if (!params) throw new Error('Expected the adapter create params');
    const newer = await stripe.checkout.sessions.create(params, {
      idempotencyKey: 'second-open-session',
    });
    let completed = false;
    stripe.setListHook(() => {
      if (completed) return;
      completed = true;
      completeCheckout(stripe, newer.id, 'active');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(await openSessionIds(stripe)).toEqual([]);
    expect(stripe.expireCalls.map(({ sessionId }) => sessionId)).toContain(
      reusable,
    );
  });

  it('refuses with STRIPE_ERROR when the re-check cannot list subscriptions', async () => {
    const stripe = createFake();
    let checks = 0;
    stripe.setSubscriptionListHook(() => {
      checks += 1;
      if (checks === 2) throw new Error('list failed');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
    });
  });

  it('hands back its Session after one more subscription check when nothing completed', async () => {
    const stripe = createFake();

    const created = await createCheckout(stripe);

    expect(await openSessionIds(stripe)).toEqual([sessionIdOf(created.url)]);
    expect(stripe.subscriptions.listCalls).toHaveLength(2);
  });
});
