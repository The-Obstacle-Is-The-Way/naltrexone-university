import { describe, expect, it } from 'vitest';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import {
  FakePaymentGateway,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createTestWebhookTrialSetupCompletion,
  createTestWebhookTrialSetupExpiration,
} from '@/src/application/test-helpers/webhook-event-results';
import { processStripeWebhook } from './stripe-webhook-controller';
import {
  createRollbackAwareStripeWebhookTestHarness,
  createStripeWebhookTestHarness,
  createWebhookPaymentGateway,
  type StripeWebhookTestHarness,
  seedPendingTrialSetupOperation,
} from './test-helpers/stripe-webhook-controller-harness';

class LookupFailingSetupOperationRepository extends FakeTrialPaymentMethodSetupOperationRepository {
  override async findBySessionId(): Promise<never> {
    throw new Error('setup operation lookup failed');
  }
}

type TrialSetupCompletion = NonNullable<
  WebhookEventResult['trialPaymentMethodSetupCompletion']
>;

// The trial the setup Session adds a card to: the user's in-trial row and
// their Stripe customer mapping, as the controller's ownership check reads them.
async function seedTrialOwnership(
  harness: StripeWebhookTestHarness,
  completion: TrialSetupCompletion,
  input: {
    status?: 'inTrial' | 'active';
    currentPeriodEnd?: Date;
    stripeCustomerId?: string;
  } = {},
) {
  await harness.subscriptions.upsert({
    userId: completion.userId,
    externalSubscriptionId: completion.externalSubscriptionId,
    plan: completion.plan,
    status: input.status ?? 'inTrial',
    currentPeriodEnd: input.currentPeriodEnd ?? completion.trialEndsAt,
    cancelAtPeriodEnd: false,
    expectedVersion: null,
  });
  await harness.stripeCustomers.insert(
    completion.userId,
    input.stripeCustomerId ?? completion.externalCustomerId,
  );
}

describe('processStripeWebhook trial payment-method setup', () => {
  it('tolerates subscription time drift and records the live billing period at completion', async () => {
    const userId = crypto.randomUUID();
    const completion = createTestWebhookTrialSetupCompletion({
      sessionId: 'cs_setup_123',
      userId,
    });
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup',
      type: 'checkout.session.completed',
      trialPaymentMethodSetupCompletion: completion,
    });
    const harness = createStripeWebhookTestHarness({ paymentGateway });
    await seedTrialOwnership(harness, completion, {
      status: 'active',
      currentPeriodEnd: new Date('2026-09-13T12:00:00Z'),
    });
    const pending = await seedPendingTrialSetupOperation(
      harness.setupOperations,
      completion,
    );

    await processStripeWebhook(harness.deps, {
      rawBody: 'raw',
      signature: 'sig',
    });

    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([
      {
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_123',
      },
    ]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([
      {
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalSubscriptionId: 'sub_123',
      },
    ]);
    await expect(
      harness.setupOperations.findBySessionId('cs_setup_123'),
    ).resolves.toMatchObject({
      status: 'completed',
      stripePaymentMethodId: 'pm_123',
      paymentMethodAttachedAt: expect.any(Date),
      subscriptionDefaultSetAt: expect.any(Date),
      completedAt: expect.any(Date),
    });
    expect(harness.renewalConsents.snapshot()).toEqual([
      expect.objectContaining({
        userId,
        setupSessionId: 'cs_setup_123',
        checkoutSessionId: null,
        externalSubscriptionId: 'sub_123',
        disclosureSnapshot: pending.disclosureSnapshot,
        trialEndsAt: null,
        cancellationDeadline: new Date('2026-09-13T12:00:00Z'),
        acceptedAt: completion.acceptedAt,
      }),
    ]);
  });

  it('marks a signed expired setup Session without attaching a payment method', async () => {
    const expiredAt = new Date('2026-08-07T12:00:00Z');
    const expiration = createTestWebhookTrialSetupExpiration({
      sessionId: 'cs_setup_expired',
      userId: crypto.randomUUID(),
      expiredAt,
    });
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup_expired',
      type: 'checkout.session.expired',
      trialPaymentMethodSetupExpiration: expiration,
    });
    const { deps, setupOperations } = createStripeWebhookTestHarness({
      paymentGateway,
    });
    await seedPendingTrialSetupOperation(setupOperations, expiration);

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(
      setupOperations.findBySessionId('cs_setup_expired'),
    ).resolves.toMatchObject({ status: 'expired', expiredAt });
    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([]);
  });

  it('warns when an expiration arrives after the setup operation completed', async () => {
    const expiration = createTestWebhookTrialSetupExpiration({
      sessionId: 'cs_setup_completed',
      userId: crypto.randomUUID(),
    });
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup_expired_after_completion',
      type: 'checkout.session.expired',
      trialPaymentMethodSetupExpiration: expiration,
    });
    const { deps, logger, setupOperations } = createStripeWebhookTestHarness({
      paymentGateway,
    });
    await seedPendingTrialSetupOperation(setupOperations, expiration);
    await setupOperations.claim({
      sessionId: 'cs_setup_completed',
      claimId: 'claim_completed',
      claimedAt: new Date('2026-08-07T11:59:00Z'),
      staleBefore: new Date(0),
    });
    await setupOperations.markCompleted({
      sessionId: 'cs_setup_completed',
      claimId: 'claim_completed',
      completedAt: new Date('2026-08-07T11:59:30Z'),
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(
      setupOperations.findBySessionId('cs_setup_completed'),
    ).resolves.toMatchObject({ status: 'completed', expiredAt: null });
    expect(logger.warnCalls).toContainEqual({
      context: {
        eventId: 'evt_setup_expired_after_completion',
        sessionId: 'cs_setup_completed',
        operationStatus: 'completed',
      },
      msg: 'Trial payment-method setup expiration did not transition the operation',
    });
  });

  it('fails closed when the accepted snapshot differs from the pending operation', async () => {
    const pendingTerms = createTestWebhookTrialSetupCompletion({
      sessionId: 'cs_setup_123',
      userId: crypto.randomUUID(),
    });
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup_mismatch',
      type: 'checkout.session.completed',
      trialPaymentMethodSetupCompletion: { ...pendingTerms, amountCents: 9999 },
    });
    const harness = createStripeWebhookTestHarness({ paymentGateway });
    await seedTrialOwnership(harness, pendingTerms);
    await seedPendingTrialSetupOperation(harness.setupOperations, pendingTerms);

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([]);
  });

  it('reports a missing setup operation before evaluating its snapshot', async () => {
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup_missing',
      type: 'checkout.session.completed',
      trialPaymentMethodSetupCompletion: createTestWebhookTrialSetupCompletion({
        sessionId: 'cs_setup_missing',
        userId: crypto.randomUUID(),
      }),
    });
    const { deps } = createStripeWebhookTestHarness({ paymentGateway });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Trial payment-method setup operation is missing',
    });
  });

  it('preserves an injected setup-operation repository subclass inside staged transactions', async () => {
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup_lookup_failure',
      type: 'checkout.session.completed',
      trialPaymentMethodSetupCompletion: createTestWebhookTrialSetupCompletion({
        sessionId: 'cs_setup_lookup_failure',
        userId: crypto.randomUUID(),
      }),
    });
    const { deps } = createRollbackAwareStripeWebhookTestHarness({
      paymentGateway,
      setupOperations: new LookupFailingSetupOperationRepository(),
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toThrow('setup operation lookup failed');
  });

  it('detaches and records a terminal outcome when signed ownership no longer matches', async () => {
    const completion = createTestWebhookTrialSetupCompletion({
      sessionId: 'cs_setup_wrong_owner',
      userId: crypto.randomUUID(),
      externalCustomerId: 'cus_signed',
    });
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_setup_wrong_owner',
      type: 'checkout.session.completed',
      trialPaymentMethodSetupCompletion: completion,
    });
    const harness = createStripeWebhookTestHarness({ paymentGateway });
    await seedTrialOwnership(harness, completion, {
      stripeCustomerId: 'cus_other',
    });
    await seedPendingTrialSetupOperation(harness.setupOperations, completion);

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).resolves.toBeUndefined();
    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([]);
    expect(paymentGateway.trialPaymentMethodDetachInputs).toEqual([
      {
        sessionId: 'cs_setup_wrong_owner',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_signed',
      },
    ]);
    await expect(
      harness.setupOperations.findBySessionId('cs_setup_wrong_owner'),
    ).resolves.toMatchObject({
      status: 'terminal',
      terminalReason: 'billing_ownership_mismatch',
      terminalAt: expect.any(Date),
    });
  });

  it('allows only one of two concurrent deliveries for the same Session to perform provider writes', async () => {
    const completion = createTestWebhookTrialSetupCompletion({
      sessionId: 'cs_setup_concurrent',
      userId: crypto.randomUUID(),
    });
    let releaseAttach: () => void = () => undefined;
    const attachBarrier = new Promise<void>((resolve) => {
      releaseAttach = resolve;
    });
    let signalAttachStarted: () => void = () => undefined;
    const attachStarted = new Promise<void>((resolve) => {
      signalAttachStarted = resolve;
    });
    // Two deliveries of the same Session arrive as distinct Stripe events;
    // the first holds its attach open until the second has been refused.
    class ConcurrentGateway extends FakePaymentGateway {
      private delivery = 0;

      override async processWebhookEvent(): Promise<WebhookEventResult> {
        this.delivery += 1;
        return {
          eventId: `evt_setup_${this.delivery}`,
          type: 'checkout.session.completed',
          trialPaymentMethodSetupCompletion: { ...completion },
        };
      }

      override async attachTrialPaymentMethod(
        input: Parameters<FakePaymentGateway['attachTrialPaymentMethod']>[0],
      ): Promise<void> {
        await super.attachTrialPaymentMethod(input);
        signalAttachStarted();
        await attachBarrier;
      }
    }
    const paymentGateway = new ConcurrentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'unused', type: 'charge.refunded' },
    });
    const harness = createStripeWebhookTestHarness({ paymentGateway });
    await seedTrialOwnership(harness, completion);
    await seedPendingTrialSetupOperation(harness.setupOperations, completion);

    const first = processStripeWebhook(harness.deps, {
      rawBody: 'raw-1',
      signature: 'sig-1',
    });
    await attachStarted;
    const second = processStripeWebhook(harness.deps, {
      rawBody: 'raw-2',
      signature: 'sig-2',
    });
    await expect(second).rejects.toMatchObject({ code: 'CONFLICT' });
    releaseAttach();
    await expect(first).resolves.toBeUndefined();

    expect(paymentGateway.trialPaymentMethodAttachInputs).toHaveLength(1);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toHaveLength(1);
  });

  it('resumes after the lease without repeating an already-recorded attach', async () => {
    const completion = createTestWebhookTrialSetupCompletion({
      sessionId: 'cs_setup_recovery',
      userId: crypto.randomUUID(),
    });
    let defaultAttempts = 0;
    class OnceFailingDefaultGateway extends FakePaymentGateway {
      override async setTrialSubscriptionDefaultPaymentMethod(
        input: Parameters<
          FakePaymentGateway['setTrialSubscriptionDefaultPaymentMethod']
        >[0],
      ): Promise<void> {
        defaultAttempts += 1;
        if (defaultAttempts === 1) throw new Error('transient');
        await super.setTrialSubscriptionDefaultPaymentMethod(input);
      }
    }
    const paymentGateway = new OnceFailingDefaultGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup_recovery',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: completion,
      },
    });
    let now = new Date('2026-08-06T12:00:00Z');
    const harness = createStripeWebhookTestHarness({
      paymentGateway,
      now: () => now,
    });
    await seedTrialOwnership(harness, completion);
    await seedPendingTrialSetupOperation(harness.setupOperations, completion);

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toThrow('transient');
    now = new Date('2026-08-06T12:06:00Z');
    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).resolves.toBeUndefined();

    expect(paymentGateway.trialPaymentMethodAttachInputs).toHaveLength(1);
    expect(defaultAttempts).toBe(2);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toHaveLength(1);
    await expect(
      harness.setupOperations.findBySessionId('cs_setup_recovery'),
    ).resolves.toMatchObject({ status: 'completed' });
  });
});
