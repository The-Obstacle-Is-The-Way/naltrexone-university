import { expect, test } from '@playwright/test';
import { runCheckoutSuccessProviderContract } from './helpers/checkout-success-provider-contract';

test.describe
  .serial('provider-backed Checkout success contract', () => {
    // This contract creates and cleans up real Stripe test-mode objects and runs
    // the production success sync, so it needs the authenticated-flow budget.
    test.setTimeout(120_000);

    test('paid annual checkout persists an active annual entitlement', async () => {
      const evidence = await runCheckoutSuccessProviderContract('annual');

      expect(evidence).toMatchObject({
        applicationSession: {
          status: 'open',
          mode: 'subscription',
          usesConfiguredPrice: true,
          usesApplicationUser: true,
          usesMappedCustomer: true,
          usesSuccessUrl: true,
          usesCancelUrl: true,
          usesRenewalTerms: true,
          requiresTerms: true,
          allowsPromotionCodes: false,
          billingAddressCollection: 'auto',
          paymentMethodCollection: 'always',
        },
        openSessionRejected: true,
        localSubscriptionCountAfterOpenRejection: 1,
        completedSession: {
          status: 'complete',
          mode: 'subscription',
          paymentStatus: 'paid',
          usesConfiguredPrice: true,
          isTestMode: true,
        },
        providerSubscription: {
          status: 'active',
          usesApplicationUser: true,
          usesConfiguredPrice: true,
          hasFuturePeriod: true,
          isTestMode: true,
          paidInvoiceStatus: 'paid',
          paidInvoiceAmount: 19_900,
        },
        successSyncStatus: 'active',
        persisted: {
          rowCount: 1,
          status: 'active',
          plan: 'annual',
          usesCompletedSubscription: true,
        },
        entitlement: {
          isEntitled: true,
          status: 'active',
          plan: 'annual',
        },
      });
    });

    test('cardless monthly trial persists a trial entitlement without a payment method', async () => {
      const evidence =
        await runCheckoutSuccessProviderContract('monthly-trial');

      expect(evidence).toMatchObject({
        applicationSession: {
          status: 'open',
          mode: 'subscription',
          usesConfiguredPrice: true,
          usesApplicationUser: true,
          usesMappedCustomer: true,
          usesSuccessUrl: true,
          usesCancelUrl: true,
          usesRenewalTerms: true,
          requiresTerms: true,
          allowsPromotionCodes: false,
          billingAddressCollection: 'auto',
          paymentMethodCollection: 'if_required',
        },
        openSessionRejected: true,
        localSubscriptionCountAfterOpenRejection: 0,
        completedSession: {
          status: 'complete',
          mode: 'subscription',
          paymentStatus: 'paid',
          usesConfiguredPrice: true,
          isTestMode: true,
        },
        providerSubscription: {
          status: 'trialing',
          usesApplicationUser: true,
          usesConfiguredPrice: true,
          hasFuturePeriod: true,
          isTestMode: true,
          trialPeriodDays: 7,
          defaultPaymentMethodAbsent: true,
          customerCardCount: 0,
        },
        successSyncStatus: 'inTrial',
        persisted: {
          rowCount: 1,
          status: 'trialing',
          plan: 'monthly',
          usesCompletedSubscription: true,
        },
        entitlement: {
          isEntitled: true,
          status: 'inTrial',
          plan: 'monthly',
        },
      });
    });
  });
