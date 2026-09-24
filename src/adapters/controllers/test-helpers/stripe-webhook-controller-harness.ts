import type { WebhookEventResult } from '@/src/application/ports/gateways';
import type { TrialPaymentMethodSetupOperationInput } from '@/src/application/ports/trial-payment-method-setup-operation-repository';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeRenewalConsentRecordRepository,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import type { StripeWebhookDeps } from '../stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from './stripe-webhook-renewal-acknowledgment';

type Acknowledgment = ReturnType<
  typeof createStripeWebhookRenewalAcknowledgmentTestDeps
>;

export type StripeWebhookTestHarnessOptions = {
  paymentGateway: FakePaymentGateway;
  stripeEvents?: FakeStripeEventRepository;
  subscriptions?: FakeSubscriptionRepository;
  stripeCustomers?: FakeStripeCustomerRepository;
  logger?: FakeLogger;
  setupOperations?: FakeTrialPaymentMethodSetupOperationRepository;
  renewalConsents?: FakeRenewalConsentRecordRepository;
  now?: () => Date;
};

export type StripeWebhookTestHarness = {
  deps: StripeWebhookDeps;
  stripeEvents: FakeStripeEventRepository;
  subscriptions: FakeSubscriptionRepository;
  stripeCustomers: FakeStripeCustomerRepository;
  logger: FakeLogger;
  setupOperations: FakeTrialPaymentMethodSetupOperationRepository;
  renewalConsents: FakeRenewalConsentRecordRepository;
  renewalNoticeDeliveries: ReturnType<
    Acknowledgment['createRenewalNoticeDeliveries']
  >;
  acknowledgment: Acknowledgment;
};

// Every transaction shares the harness's fakes, so a write made before a
// throw stays visible afterwards. Use the rollback-aware harness when a case
// depends on a failed transaction discarding its writes.
export function createStripeWebhookTestHarness(
  overrides: StripeWebhookTestHarnessOptions,
): StripeWebhookTestHarness {
  const stripeEvents =
    overrides.stripeEvents ?? new FakeStripeEventRepository();
  const subscriptions =
    overrides.subscriptions ?? new FakeSubscriptionRepository();
  const stripeCustomers =
    overrides.stripeCustomers ?? new FakeStripeCustomerRepository();
  const logger = overrides.logger ?? new FakeLogger();
  const setupOperations =
    overrides.setupOperations ??
    new FakeTrialPaymentMethodSetupOperationRepository();
  const renewalConsents =
    overrides.renewalConsents ?? new FakeRenewalConsentRecordRepository();
  const acknowledgment = createStripeWebhookRenewalAcknowledgmentTestDeps();

  return {
    deps: {
      paymentGateway: overrides.paymentGateway,
      subscriptionVersions: subscriptions,
      logger,
      now: overrides.now ?? (() => new Date()),
      ...acknowledgment.webhook,
      transaction: async (fn) =>
        fn({
          stripeEvents,
          subscriptions,
          stripeCustomers,
          trialPaymentMethodSetupOperations: setupOperations,
          renewalConsentRecords: renewalConsents,
          ...acknowledgment.transaction,
        }),
    },
    stripeEvents,
    subscriptions,
    stripeCustomers,
    logger,
    setupOperations,
    renewalConsents,
    renewalNoticeDeliveries: acknowledgment.renewalNoticeDeliveries,
    acknowledgment,
  };
}

// Each transaction runs against staged copies built with the injected fakes'
// own constructors (so failing subclasses keep failing) and commits them back
// only when the callback returns, as Postgres would.
export function createRollbackAwareStripeWebhookTestHarness(
  overrides: StripeWebhookTestHarnessOptions,
): StripeWebhookTestHarness {
  const base = createStripeWebhookTestHarness(overrides);

  return {
    ...base,
    deps: {
      ...base.deps,
      transaction: async (fn) => {
        const StripeEventsCtor = base.stripeEvents
          .constructor as new () => FakeStripeEventRepository;
        const SubscriptionsCtor = base.subscriptions
          .constructor as new () => FakeSubscriptionRepository;
        const StripeCustomersCtor = base.stripeCustomers
          .constructor as new () => FakeStripeCustomerRepository;
        const SetupOperationsCtor = base.setupOperations
          .constructor as new () => FakeTrialPaymentMethodSetupOperationRepository;
        const RenewalConsentsCtor = base.renewalConsents
          .constructor as new () => FakeRenewalConsentRecordRepository;

        const stagingEvents = new StripeEventsCtor();
        const stagingSubscriptions = new SubscriptionsCtor();
        const stagingStripeCustomers = new StripeCustomersCtor();
        const stagingSetupOperations = new SetupOperationsCtor();
        const stagingRenewalConsents = new RenewalConsentsCtor();
        const stagingRenewalNoticeDeliveries =
          base.acknowledgment.createRenewalNoticeDeliveries();

        stagingEvents.restore(base.stripeEvents.snapshot());
        stagingSubscriptions.restore(base.subscriptions.snapshot());
        stagingStripeCustomers.restore(base.stripeCustomers.snapshot());
        stagingSetupOperations.restore(base.setupOperations.snapshot());
        stagingRenewalConsents.restore(base.renewalConsents.snapshot());
        stagingRenewalNoticeDeliveries.restore(
          base.renewalNoticeDeliveries.snapshot(),
        );

        const result = await fn({
          stripeEvents: stagingEvents,
          subscriptions: stagingSubscriptions,
          stripeCustomers: stagingStripeCustomers,
          trialPaymentMethodSetupOperations: stagingSetupOperations,
          renewalConsentRecords: stagingRenewalConsents,
          renewalNoticeDeliveries: stagingRenewalNoticeDeliveries,
          users: base.acknowledgment.transaction.users,
        });

        base.stripeEvents.restore(stagingEvents.snapshot());
        base.subscriptions.restore(stagingSubscriptions.snapshot());
        base.stripeCustomers.restore(stagingStripeCustomers.snapshot());
        base.setupOperations.restore(stagingSetupOperations.snapshot());
        base.renewalConsents.restore(stagingRenewalConsents.snapshot());
        base.renewalNoticeDeliveries.restore(
          stagingRenewalNoticeDeliveries.snapshot(),
        );

        return result;
      },
    },
  };
}

// The controller only reads the normalized event from the gateway; the
// checkout, portal and customer outputs are never reached on this path.
export function createWebhookPaymentGateway(
  webhookResult: WebhookEventResult,
): FakePaymentGateway {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_test',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult,
  });
}

// Seeds the pending operation the setup Session was created with, from the
// same terms the event's accepted snapshot carries. Returns the seeded input
// so assertions can name the values the operation contributes.
export async function seedPendingTrialSetupOperation(
  setupOperations: FakeTrialPaymentMethodSetupOperationRepository,
  accepted: Pick<
    TrialPaymentMethodSetupOperationInput,
    | 'sessionId'
    | 'userId'
    | 'plan'
    | 'amountCents'
    | 'currency'
    | 'frequency'
    | 'trialEndsAt'
    | 'disclosureVersion'
    | 'termsVersion'
    | 'termsHash'
  > & { externalCustomerId: string; externalSubscriptionId: string },
): Promise<TrialPaymentMethodSetupOperationInput> {
  const { disclosureSnapshot, cancellationMethod } = createTestRenewalTerms(
    accepted.plan,
    true,
  );
  const input: TrialPaymentMethodSetupOperationInput = {
    sessionId: accepted.sessionId,
    userId: accepted.userId,
    stripeCustomerId: accepted.externalCustomerId,
    stripeSubscriptionId: accepted.externalSubscriptionId,
    plan: accepted.plan,
    amountCents: accepted.amountCents,
    currency: accepted.currency,
    frequency: accepted.frequency,
    trialEndsAt: accepted.trialEndsAt,
    disclosureSnapshot,
    disclosureVersion: accepted.disclosureVersion,
    termsVersion: accepted.termsVersion,
    termsHash: accepted.termsHash,
    cancellationMethod,
  };
  await setupOperations.createPending(input);
  return input;
}
