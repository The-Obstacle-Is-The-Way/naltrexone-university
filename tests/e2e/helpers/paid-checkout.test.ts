import { describe, expect, it, vi } from 'vitest';
import {
  expectE2EUserHasPaidAnnualSubscription,
  type PaidAnnualCheckoutEvidence,
  type PaidCheckoutLifecycleServices,
  prepareE2EUserForPaidCheckout,
  restoreE2EUserAfterPaidCheckout,
  validatePaidAnnualCheckoutEvidence,
} from './paid-checkout';
import type { E2EEntitlementSnapshot } from './subscription';

const baselineSnapshot: E2EEntitlementSnapshot = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  stripeSubscriptionId: 'subscription-fixture',
  status: 'active',
  priceId: 'monthly-price-fixture',
  currentPeriodEnd: new Date('2026-09-18T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
  version: 7,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-10T00:00:00.000Z'),
};

function createLifecycleServices(
  overrides: Partial<PaidCheckoutLifecycleServices> = {},
): PaidCheckoutLifecycleServices {
  return {
    removeEntitlement: vi.fn(async () => baselineSnapshot),
    resetToFirstTimer: vi.fn(async () => {}),
    restoreEntitlement: vi.fn(async (_snapshot) => {}),
    restorePaidSubscription: vi.fn(async () => {}),
    ...overrides,
  };
}

function createValidEvidence(
  overrides: Partial<PaidAnnualCheckoutEvidence> = {},
): PaidAnnualCheckoutEvidence {
  return {
    dbRowCount: 1,
    dbStatus: 'active',
    dbUsesAnnualPrice: true,
    dbPeriodIsFuture: true,
    providerStatus: 'active',
    providerUsesAnnualPrice: true,
    providerPeriodIsFuture: true,
    providerHasNoTrial: true,
    providerUsesMappedCustomer: true,
    providerUsesAppUser: true,
    providerIsTestMode: true,
    invoiceStatus: 'paid',
    invoiceAmountPaid: 19_900,
    invoiceCurrency: 'usd',
    invoiceIsTestMode: true,
    paymentStatus: 'succeeded',
    paymentIsTestMode: true,
    hasCharge: true,
    ...overrides,
  };
}

describe('paid Checkout E2E lifecycle', () => {
  it('clears provider blockers and restores a terminal local row for paid Checkout', async () => {
    const services = createLifecycleServices();

    await prepareE2EUserForPaidCheckout({ services });

    expect(services.removeEntitlement).toHaveBeenCalledOnce();
    expect(services.resetToFirstTimer).toHaveBeenCalledOnce();
    expect(services.restoreEntitlement).toHaveBeenCalledWith({
      ...baselineSnapshot,
      status: 'canceled',
    });
    expect(
      vi.mocked(services.removeEntitlement).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(services.resetToFirstTimer).mock.invocationCallOrder[0] ?? 0,
    );
    expect(
      vi.mocked(services.resetToFirstTimer).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(services.restoreEntitlement).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('resets the purchased subscription before reseeding paid baseline state', async () => {
    const services = createLifecycleServices();

    await restoreE2EUserAfterPaidCheckout({ services });

    expect(services.resetToFirstTimer).toHaveBeenCalledOnce();
    expect(services.restorePaidSubscription).toHaveBeenCalledOnce();
    expect(
      vi.mocked(services.resetToFirstTimer).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(services.restorePaidSubscription).mock.invocationCallOrder[0] ??
        0,
    );
  });

  it('still attempts to restore paid baseline state when reset fails', async () => {
    const resetError = new Error('reset failed');
    const services = createLifecycleServices({
      resetToFirstTimer: vi.fn(async () => {
        throw resetError;
      }),
    });

    await expect(restoreE2EUserAfterPaidCheckout({ services })).rejects.toBe(
      resetError,
    );

    expect(services.restorePaidSubscription).toHaveBeenCalledOnce();
  });

  it('reports both cleanup failures without dropping either cause', async () => {
    const resetError = new Error('reset failed');
    const restoreError = new Error('restore failed');
    const services = createLifecycleServices({
      resetToFirstTimer: vi.fn(async () => {
        throw resetError;
      }),
      restorePaidSubscription: vi.fn(async () => {
        throw restoreError;
      }),
    });

    try {
      await restoreE2EUserAfterPaidCheckout({ services });
      throw new Error('Expected cleanup to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([
        resetError,
        restoreError,
      ]);
    }
  });
});

describe('validatePaidAnnualCheckoutEvidence', () => {
  it('loads and validates the live observation through the injectable boundary', async () => {
    const evidence = createValidEvidence();
    const loadEvidence = vi.fn(async () => evidence);

    await expect(
      expectE2EUserHasPaidAnnualSubscription({
        services: { loadEvidence },
      }),
    ).resolves.toEqual(evidence);

    expect(loadEvidence).toHaveBeenCalledOnce();
  });

  it('accepts a paid annual subscription observed through every causal boundary', () => {
    expect(validatePaidAnnualCheckoutEvidence(createValidEvidence())).toEqual(
      createValidEvidence(),
    );
  });

  it.each([
    ['DB_ROW_COUNT', { dbRowCount: 0 }],
    ['DB_STATUS', { dbStatus: 'trialing' }],
    ['DB_PLAN', { dbUsesAnnualPrice: false }],
    ['DB_PERIOD', { dbPeriodIsFuture: false }],
    ['PROVIDER_STATUS', { providerStatus: 'trialing' }],
    ['PROVIDER_PLAN', { providerUsesAnnualPrice: false }],
    ['PROVIDER_PERIOD', { providerPeriodIsFuture: false }],
    ['PROVIDER_TRIAL', { providerHasNoTrial: false }],
    ['PROVIDER_CUSTOMER', { providerUsesMappedCustomer: false }],
    ['PROVIDER_USER', { providerUsesAppUser: false }],
    ['PROVIDER_MODE', { providerIsTestMode: false }],
    ['INVOICE_STATUS', { invoiceStatus: 'open' }],
    ['INVOICE_AMOUNT', { invoiceAmountPaid: 0 }],
    ['INVOICE_CURRENCY', { invoiceCurrency: 'eur' }],
    ['INVOICE_MODE', { invoiceIsTestMode: false }],
    ['PAYMENT_STATUS', { paymentStatus: 'processing' }],
    ['PAYMENT_MODE', { paymentIsTestMode: false }],
    ['CHARGE_MISSING', { hasCharge: false }],
  ] as const)(
    'fails closed with %s when the causal receipt is invalid',
    (code, overrides) => {
      expect(() =>
        validatePaidAnnualCheckoutEvidence(createValidEvidence(overrides)),
      ).toThrow(`[E2E_PAID_CHECKOUT:${code}]`);
    },
  );
});
