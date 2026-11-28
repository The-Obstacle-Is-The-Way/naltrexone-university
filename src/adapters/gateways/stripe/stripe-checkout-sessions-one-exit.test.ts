import { beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { StripeCallBudget } from './stripe-call-budget';
import {
  createStripeCheckoutSession,
  OPEN_CHECKOUT_SESSION_RECONCILE_LIMIT,
} from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const SECOND_MS = 1_000;
const HOUR_MS = 60 * 60 * SECOND_MS;

// BUG-343 option 9: a request that fails after creating its page leaves that
// page open beside an earlier one, and a later request for the same plan and
// terms used to hand the new page back without looking for the other. Every
// Session handed back now leaves through one exit, which keeps the newest
// open Session the customer has and expires the others first.
describe('createStripeCheckoutSession hands back one open Session', () => {
  const customer = 'cus_one_exit';
  const appUserId = crypto.randomUUID();
  const base = {
    userId: appUserId,
    externalCustomerId: customer,
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const monthly = { ...base, ...createTestRenewalTerms('monthly') };
  const annual = { ...base, ...createTestRenewalTerms('annual') };
  const monthlyTrial = {
    ...base,
    ...createTestRenewalTerms('monthly', true),
    trialPeriodDays: 7,
  };
  type CheckoutInput = typeof monthly | typeof annual | typeof monthlyTrial;
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const fixedNowMs = 1_700_000_000_000;
  // The fake stamps a Session's `created` second from this clock; a case
  // moves it only to make a staged Session newer.
  let fakeNowMs = fixedNowMs;
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
    fakeNowMs = fixedNowMs;
  });

  function createFake(): FakeStripeCheckoutClient {
    return new FakeStripeCheckoutClient(() => fakeNowMs);
  }

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
    input: CheckoutInput,
    nowMs: () => number = () => fixedNowMs,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input,
      priceIds,
      logger,
      operationalAlerts: new FakeOperationalAlerts(),
      nowMs,
    });
  }

  // A buyer's request runs under one caller deadline, which leaves retries to
  // the transport: each Stripe call is made once.
  function createInteractiveCheckout(
    stripe: FakeStripeCheckoutClient,
    input: CheckoutInput,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input,
      priceIds,
      logger,
      operationalAlerts: new FakeOperationalAlerts(),
      nowMs: () => fixedNowMs,
      budget: new StripeCallBudget(),
    });
  }

  function sessionUrl(id: string): string {
    return `https://checkout.stripe.test/${id}`;
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

  // Fails the listing the exit reconciles from, and no other listing.
  function failTheReconcileListing(stripe: FakeStripeCheckoutClient): void {
    stripe.setListHook((params) => {
      if (params.limit === OPEN_CHECKOUT_SESSION_RECONCILE_LIMIT) {
        throw new Error('reconcile listing failed');
      }
    });
  }

  function failEveryExpire(stripe: FakeStripeCheckoutClient): void {
    stripe.setExpireFault(() => {
      throw new Error('expire transport failed');
    });
  }

  // The first reproduction: a trial checkout can neither read nor expire the
  // earlier page, creates its own under a recovery key, and fails again to
  // expire the earlier one. Both pages stay open; the expire fault stays set.
  async function leaveTwoOpenTrialPages(
    stripe: FakeStripeCheckoutClient,
  ): Promise<void> {
    await createCheckout(stripe, monthlyTrial);
    stripe.setRetrieveOverride((session) => {
      if (session.id === 'cs_fake_1') throw new Error('retrieve failed');
      return session;
    });
    failEveryExpire(stripe);
    await expect(createCheckout(stripe, monthlyTrial)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });
    stripe.setRetrieveOverride(null);
    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2', 'cs_fake_1']);
  }

  // What the adapter sends Stripe for an annual checkout by this customer.
  async function annualCreateParams(): Promise<CheckoutSessionCreateParams> {
    const probe = createFake();
    await createCheckout(probe, annual);
    const params = probe.createCalls[0]?.params;
    if (!params) throw new Error('Expected the adapter create params');
    return params;
  }

  // A reuse reads the Session it found before it lists the open ones again,
  // so a Session another request creates meanwhile is staged at that read,
  // once, a second later. `alsoStage` runs after it.
  function stageNewerAnnualSessionDuringReuse(
    stripe: FakeStripeCheckoutClient,
    params: CheckoutSessionCreateParams,
    alsoStage: () => void = () => undefined,
  ): void {
    let staged = false;
    stripe.setRetrieveOverride(async (session) => {
      if (staged) return session;
      staged = true;
      fakeNowMs += SECOND_MS;
      await stripe.checkout.sessions.create(params, {
        idempotencyKey: 'concurrent-annual-checkout',
      });
      alsoStage();
      return session;
    });
  }

  it('leaves one open Session when a trial checkout that could neither read nor expire the earlier page is retried', async () => {
    const stripe = createFake();
    await leaveTwoOpenTrialPages(stripe);
    stripe.setExpireFault(null);

    await expect(createCheckout(stripe, monthlyTrial)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2']);
  });

  it("leaves one open Session when a checkout that could not expire the other plan's page is retried", async () => {
    const stripe = createFake();
    // The annual request's listing finds no open page. The monthly request
    // then runs whole and hands back its page, before the annual create.
    let staged = false;
    let monthlyResult: { url: string } | undefined;
    stripe.setCreateFault(async () => {
      if (staged) return;
      staged = true;
      monthlyResult = await createCheckout(stripe, monthly);
    });
    failEveryExpire(stripe);
    await expect(createCheckout(stripe, annual)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });
    expect(monthlyResult).toEqual({ url: sessionUrl('cs_fake_1') });
    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2', 'cs_fake_1']);
    stripe.setExpireFault(null);

    await expect(createCheckout(stripe, annual)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2']);
  });

  it('refuses to hand back a page it found when the open Sessions cannot be listed', async () => {
    const stripe = createFake();
    await createCheckout(stripe, monthly);
    failTheReconcileListing(stripe);

    await expect(createCheckout(stripe, monthly)).rejects.toThrow();

    expect(stripe.createCalls).toHaveLength(1);
    expect(stripe.expireCalls).toEqual([]);
  });

  it('refuses to hand back a page it created when the open Sessions cannot be listed', async () => {
    const stripe = createFake();
    failTheReconcileListing(stripe);

    await expect(createCheckout(stripe, monthly)).rejects.toThrow();

    expect(stripe.createCalls).toHaveLength(1);
    expect(stripe.expireCalls).toEqual([]);
  });

  // Stripe saves a server error under the request's idempotency key and
  // replays it to later requests with that key for at least a day. An expire
  // sent under a key fixed per Session would fail on every later request, so
  // a buyer switching plans would be refused until the earlier page lapsed.
  it('serves a buyer switching plans on the next press although Stripe answered the first expire with a server error', async () => {
    const stripe = createFake();
    await createInteractiveCheckout(stripe, monthly);
    stripe.setExpireFault(() => {
      throw Object.assign(new Error('An unknown error occurred'), {
        type: 'StripeAPIError',
        statusCode: 500,
      });
    });
    await expect(
      createInteractiveCheckout(stripe, annual),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to expire existing checkout session',
    });
    expect(stripe.expireCalls).toEqual([{ sessionId: 'cs_fake_1' }]);
    expect(await openSessionIds(stripe)).toEqual(['cs_fake_1']);
    stripe.setExpireFault(null);

    await expect(createInteractiveCheckout(stripe, annual)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2']);
  });

  it('refuses a reuse that cannot expire another open Session', async () => {
    const stripe = createFake();
    await leaveTwoOpenTrialPages(stripe);

    await expect(createCheckout(stripe, monthlyTrial)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });

    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2', 'cs_fake_1']);
  });

  it("leaves a concurrent create's Session open and unreturned beside the one a reuse handed back, until a later request expires the first", async () => {
    const stripe = createFake();
    // The annual request's listing finds no open page. Before its create, a
    // monthly request creates a page and a second one reuses it; the annual
    // request then creates its own page and cannot expire the monthly one.
    let staged = false;
    let reused: { url: string } | undefined;
    stripe.setCreateFault(async () => {
      if (staged) return;
      staged = true;
      await createCheckout(stripe, monthly);
      reused = await createCheckout(stripe, monthly);
      failEveryExpire(stripe);
    });
    await expect(createCheckout(stripe, annual)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });
    expect(reused).toEqual({ url: sessionUrl('cs_fake_1') });
    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2', 'cs_fake_1']);
    stripe.setExpireFault(null);

    await expect(createCheckout(stripe, annual)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2']);
  });

  it('hands back a newer Session a concurrent request created for the other plan, and expires the one it found', async () => {
    const stripe = createFake();
    await createCheckout(stripe, monthly);
    stageNewerAnnualSessionDuringReuse(stripe, await annualCreateParams());

    await expect(createCheckout(stripe, monthly)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(await openSessionIds(stripe)).toEqual(['cs_fake_2']);
    expect(stripe.expireCalls.map(({ sessionId }) => sessionId)).toEqual([
      'cs_fake_1',
    ]);
  });

  it('refuses with ALREADY_SUBSCRIBED and leaves no open Session when the Session a reuse found completes beside a newer one', async () => {
    const stripe = createFake();
    await createCheckout(stripe, monthly);
    stageNewerAnnualSessionDuringReuse(
      stripe,
      await annualCreateParams(),
      () => {
        stripe.markComplete('cs_fake_1', 'sub_cs_fake_1');
        stripe.seedSubscription({
          id: 'sub_cs_fake_1',
          customer,
          status: 'active',
        });
      },
    );

    await expect(createCheckout(stripe, monthly)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(await openSessionIds(stripe)).toEqual([]);
  });

  it('hands back a dead link, and leaves no page open, when another request expired the Session a reuse found', async () => {
    const stripe = createFake();
    // A monthly page, and a newer annual page a failed request left open.
    await createCheckout(stripe, monthly);
    fakeNowMs += SECOND_MS;
    await stripe.checkout.sessions.create(await annualCreateParams(), {
      idempotencyKey: 'leftover-annual-checkout',
    });
    // While the annual request reads the annual page it found, a monthly
    // request runs whole: it expires that page for the other plan, and hands
    // back the monthly page its create replays.
    let staged = false;
    let monthlyResult: { url: string } | undefined;
    stripe.setRetrieveOverride(async (session) => {
      if (staged) return session;
      staged = true;
      monthlyResult = await createCheckout(stripe, monthly);
      return session;
    });

    // The known limit: the annual request still ranks the page it found
    // newest, so it expires the monthly page and hands back a dead link.
    // Both buyers start again; what matters is that no two pages stay open.
    await expect(createCheckout(stripe, annual)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(monthlyResult).toEqual({ url: sessionUrl('cs_fake_1') });
    expect(await openSessionIds(stripe)).toEqual([]);
  });

  it('refuses a reuse whose found Session expires before the reconcile, with no other Session open', async () => {
    const stripe = createFake();
    await createCheckout(stripe, monthly);
    // The found Session is still live when the reuse checks it, and past its
    // 24-hour expiry when the reconcile reads the clock.
    const nowValues = [fixedNowMs, fixedNowMs + 25 * HOUR_MS];
    const nowMs = () => nowValues.shift() ?? fixedNowMs + 25 * HOUR_MS;

    await expect(createCheckout(stripe, monthly, nowMs)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session is expired or inactive',
    });

    expect(stripe.expireCalls).toEqual([]);
    expect(stripe.createCalls).toHaveLength(1);
  });

  it('reuses the only open Session after one more open-Session listing and no expire', async () => {
    const stripe = createFake();
    await createCheckout(stripe, monthly);
    const listingsBefore = stripe.listCalls.length;

    await expect(createCheckout(stripe, monthly)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.listCalls.slice(listingsBefore)).toEqual([
      { customer, status: 'open', limit: 1 },
      { customer, status: 'open', limit: 10 },
    ]);
    expect(stripe.expireCalls).toEqual([]);
    expect(stripe.createCalls).toHaveLength(1);
  });
});
