import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { syncCheckoutSuccess } from '@/app/(marketing)/checkout/success/checkout-success-sync';
import * as schema from '@/db/schema';
import { createCheckoutRenewalTerms, PRICING_DATA } from '@/lib/pricing-data';
import { StripePaymentGateway } from '@/src/adapters/gateways/stripe-payment-gateway';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import {
  FakeAuthGateway,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import {
  CheckEntitlementUseCase,
  CreateCheckoutSessionUseCase,
} from '@/src/application/use-cases';
import {
  assertOpenSessionRejected,
  type ContractResources,
  type ContractShape,
  cleanupContractResources,
  createApplicationUser,
  finalizeProviderContract,
  findCreatedApplicationSession,
  findTriggeredSession,
  getPersistedSubscriptionPlan,
  getStripeId,
  redirectForProviderContract,
  requireProviderEnv,
  sessionHasExpectedRenewalTerms,
} from './checkout-success-provider-resources';
import { triggerStripeCompletedCheckout } from './stripe-cli-checkout';
import { createStripeTestClient } from './stripe-test-client';

type ProviderContractEvidence = {
  applicationSession: {
    status: string | null;
    mode: string;
    usesConfiguredPrice: boolean;
    usesApplicationUser: boolean;
    usesMappedCustomer: boolean;
    usesSuccessUrl: boolean;
    usesCancelUrl: boolean;
    usesRenewalTerms: boolean;
    requiresTerms: boolean;
    allowsPromotionCodes: boolean;
    billingAddressCollection: string | null;
    paymentMethodCollection: string | null;
  };
  openSessionRejected: boolean;
  localSubscriptionCountAfterOpenRejection: number;
  completedSession: {
    status: string | null;
    mode: string;
    paymentStatus: string;
    usesConfiguredPrice: boolean;
    isTestMode: boolean;
  };
  providerSubscription: {
    status: string;
    usesApplicationUser: boolean;
    usesConfiguredPrice: boolean;
    hasFuturePeriod: boolean;
    isTestMode: boolean;
    paidInvoiceStatus: string | null;
    paidInvoiceAmount: number | null;
    trialPeriodDays: number | null;
    defaultPaymentMethodAbsent: boolean | null;
    customerCardCount: number | null;
  };
  successSyncStatus: string;
  persisted: {
    rowCount: number;
    status: string | null;
    plan: string | null;
    usesCompletedSubscription: boolean;
  };
  entitlement: {
    isEntitled: boolean;
    status: string | null | undefined;
    plan: string | null | undefined;
  };
};

export async function runCheckoutSuccessProviderContract(
  shape: ContractShape,
): Promise<ProviderContractEvidence> {
  const databaseUrl = requireProviderEnv('DATABASE_URL');
  const stripeSecretKey = requireProviderEnv('STRIPE_SECRET_KEY');
  const e2eOwner = requireProviderEnv('E2E_STRIPE_OWNER');
  if (stripeSecretKey.includes('dummy')) {
    throw new Error('[E2E_PROVIDER_CONTRACT:REAL_TEST_KEY_REQUIRED]');
  }
  const priceIds = {
    monthly: requireProviderEnv('NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY'),
    annual: requireProviderEnv('NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL'),
  };
  const priceId = shape === 'annual' ? priceIds.annual : priceIds.monthly;
  const appUrl = requireProviderEnv('NEXT_PUBLIC_APP_URL');
  const stripe = createStripeTestClient(stripeSecretKey);
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });
  const resources: ContractResources = {
    userId: null,
    appSessionId: null,
    appCustomerId: null,
    completedCustomerId: null,
    marker: null,
  };

  let evidence: ProviderContractEvidence | null = null;
  let primaryError: unknown;
  try {
    const user = await createApplicationUser(db, shape);
    const marker = `debt471-${shape}-${user.id}`;
    resources.userId = user.id;
    resources.marker = marker;

    if (shape === 'annual') {
      await db.insert(schema.stripeSubscriptions).values({
        userId: user.id,
        stripeSubscriptionId: `local_debt471_${user.id}`,
        status: 'canceled',
        priceId,
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      });
    }

    const logger = new FakeLogger();
    const stripeCustomers = new DrizzleStripeCustomerRepository(db);
    const subscriptions = new DrizzleSubscriptionRepository(db, priceIds);
    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_unused_by_checkout_contract',
      priceIds,
      logger,
    });
    const createCheckout = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      subscriptions,
      gateway,
      logger,
      () => new Date(),
      createCheckoutRenewalTerms,
    );
    const successUrl = `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/pricing?checkout=cancel`;
    await createCheckout.execute({
      userId: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      plan: shape === 'annual' ? 'annual' : 'monthly',
      successUrl,
      cancelUrl,
    });

    const mapping = await stripeCustomers.findByUserId(user.id);
    if (!mapping)
      throw new Error('Application Stripe customer was not mapped.');
    resources.appCustomerId = mapping.stripeCustomerId;
    const appSession = await findCreatedApplicationSession(
      stripe,
      mapping.stripeCustomerId,
      user.id,
    );
    resources.appSessionId = appSession.id;
    const openSessionRejected = await assertOpenSessionRejected({
      sessionId: appSession.id,
      user,
      stripe,
      db,
      subscriptions,
      logger,
      priceIds,
      appUrl,
    });
    const localRowsAfterOpen = await db
      .select({ id: schema.stripeSubscriptions.id })
      .from(schema.stripeSubscriptions)
      .where(eq(schema.stripeSubscriptions.userId, user.id));

    const triggerStartedAt = Math.floor(Date.now() / 1000) - 5;
    await triggerStripeCompletedCheckout({
      plan: shape,
      userId: user.id,
      marker,
      email: user.email,
      e2eOwner,
      priceId,
      amountCents:
        shape === 'annual'
          ? PRICING_DATA.annual.amountCents
          : PRICING_DATA.monthly.amountCents,
      stripeSecretKey,
    });
    const completedSession = await findTriggeredSession(
      stripe,
      marker,
      triggerStartedAt,
    );
    const completedSubscriptionId = getStripeId(completedSession.subscription);
    const completedCustomerId = getStripeId(completedSession.customer);
    if (!completedSubscriptionId || !completedCustomerId) {
      throw new Error('Completed Checkout Session omitted provider ids.');
    }
    resources.completedCustomerId = completedCustomerId;
    const providerSubscription = await stripe.subscriptions.retrieve(
      completedSubscriptionId,
    );
    const item = providerSubscription.items.data[0];
    if (!item) throw new Error('Completed subscription omitted its item.');

    const syncResult = await syncCheckoutSuccess(
      { sessionId: completedSession.id },
      {
        authGateway: new FakeAuthGateway(user),
        subscriptionVersions: subscriptions,
        getClerkAuth: async () => ({
          userId: user.id,
          redirectToSignIn: () => redirectForProviderContract('/sign-in'),
        }),
        logger,
        stripe,
        priceIds,
        appUrl,
        transaction: (fn) =>
          db.transaction((tx) =>
            fn({
              subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
              stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            }),
          ),
      },
      redirectForProviderContract,
    );

    const persistedRows = await db
      .select()
      .from(schema.stripeSubscriptions)
      .where(eq(schema.stripeSubscriptions.userId, user.id));
    const persisted = persistedRows[0];
    const entitlement = await new CheckEntitlementUseCase(
      subscriptions,
    ).execute({ userId: user.id });
    let invoiceStatus: string | null = null;
    let invoiceAmount: number | null = null;
    if (shape === 'annual') {
      const invoiceId = getStripeId(providerSubscription.latest_invoice);
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        invoiceStatus = invoice.status;
        invoiceAmount = invoice.amount_paid;
      }
    }
    let cardCount: number | null = null;
    let defaultPaymentMethodAbsent: boolean | null = null;
    if (shape === 'monthly-trial') {
      const customer = await stripe.customers.retrieve(completedCustomerId);
      if ('deleted' in customer && customer.deleted) {
        throw new Error('Completed Checkout customer was deleted early.');
      }
      const cards = await stripe.paymentMethods.list({
        customer: completedCustomerId,
        type: 'card',
        limit: 10,
      });
      cardCount = cards.data.length;
      defaultPaymentMethodAbsent =
        providerSubscription.default_payment_method === null &&
        customer.invoice_settings.default_payment_method === null;
    }

    evidence = {
      applicationSession: {
        status: appSession.status,
        mode: appSession.mode,
        usesConfiguredPrice:
          appSession.line_items?.data[0]?.price?.id === priceId,
        usesApplicationUser: appSession.client_reference_id === user.id,
        usesMappedCustomer:
          getStripeId(appSession.customer) === mapping.stripeCustomerId,
        usesSuccessUrl: appSession.success_url === successUrl,
        usesCancelUrl: appSession.cancel_url === cancelUrl,
        usesRenewalTerms: sessionHasExpectedRenewalTerms(
          appSession,
          user.id,
          shape,
        ),
        requiresTerms:
          appSession.consent_collection?.terms_of_service === 'required',
        allowsPromotionCodes: appSession.allow_promotion_codes === true,
        billingAddressCollection: appSession.billing_address_collection,
        paymentMethodCollection: appSession.payment_method_collection,
      },
      openSessionRejected,
      localSubscriptionCountAfterOpenRejection: localRowsAfterOpen.length,
      completedSession: {
        status: completedSession.status,
        mode: completedSession.mode,
        paymentStatus: completedSession.payment_status,
        usesConfiguredPrice:
          completedSession.line_items?.data[0]?.price?.id === priceId,
        isTestMode: completedSession.livemode === false,
      },
      providerSubscription: {
        status: providerSubscription.status,
        usesApplicationUser: providerSubscription.metadata.user_id === user.id,
        usesConfiguredPrice: item.price.id === priceId,
        hasFuturePeriod: item.current_period_end * 1000 > Date.now(),
        isTestMode: providerSubscription.livemode === false,
        paidInvoiceStatus: invoiceStatus,
        paidInvoiceAmount: invoiceAmount,
        trialPeriodDays:
          providerSubscription.trial_start && providerSubscription.trial_end
            ? (providerSubscription.trial_end -
                providerSubscription.trial_start) /
              86_400
            : null,
        defaultPaymentMethodAbsent,
        customerCardCount: cardCount,
      },
      successSyncStatus: syncResult.status,
      persisted: {
        rowCount: persistedRows.length,
        status: persisted?.status ?? null,
        plan: getPersistedSubscriptionPlan(persisted?.priceId, priceIds),
        usesCompletedSubscription:
          persisted?.stripeSubscriptionId === completedSubscriptionId,
      },
      entitlement: {
        isEntitled: entitlement.isEntitled,
        status: entitlement.subscriptionStatus,
        plan: entitlement.plan,
      },
    };
  } catch (error) {
    primaryError = error;
  }

  await finalizeProviderContract({
    primaryError,
    cleanup: () => cleanupContractResources(db, stripe, resources),
    close: () => sql.end({ timeout: 5 }),
  });
  if (!evidence) throw new Error('[E2E_PROVIDER_CONTRACT:NO_EVIDENCE]');
  return evidence;
}
