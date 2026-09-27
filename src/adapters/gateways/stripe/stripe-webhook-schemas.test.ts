import { describe, expect, it } from 'vitest';
import {
  extractSubscriptionRef,
  stripeEventWithSubscriptionRefSchema,
  stripeSubscriptionSchema,
} from './stripe-webhook-schemas';

const CLOVER_NESTED_SUBSCRIPTION_REF = 'sub_test_REDACTED_nested';
const LEGACY_ROOT_SUBSCRIPTION_REF = 'sub_test_REDACTED_root';

function createCloverInvoicePayload() {
  return {
    id: 'in_test_REDACTED',
    object: 'invoice',
    subscription: null,
    parent: {
      type: 'subscription_details',
      subscription_details: {
        subscription: CLOVER_NESTED_SUBSCRIPTION_REF,
      },
    },
  };
}

describe('stripeEventWithSubscriptionRefSchema', () => {
  it('extracts the nested Clover subscription reference from invoice payloads', () => {
    const parsed = stripeEventWithSubscriptionRefSchema.parse(
      createCloverInvoicePayload(),
    );

    expect(extractSubscriptionRef(parsed)).toBe(CLOVER_NESTED_SUBSCRIPTION_REF);
  });

  it('extracts the legacy root subscription reference from checkout payloads', () => {
    const parsed = stripeEventWithSubscriptionRefSchema.parse({
      id: 'cs_test_REDACTED',
      object: 'checkout.session',
      subscription: LEGACY_ROOT_SUBSCRIPTION_REF,
    });

    expect(extractSubscriptionRef(parsed)).toBe(LEGACY_ROOT_SUBSCRIPTION_REF);
  });

  it('extracts an expanded object-shaped subscription reference', () => {
    const expandedSubscriptionRef = {
      id: 'sub_test_REDACTED_expanded',
      status: 'active',
    };
    const parsed = stripeEventWithSubscriptionRefSchema.parse({
      id: 'cs_test_REDACTED',
      object: 'checkout.session',
      subscription: expandedSubscriptionRef,
    });

    expect(extractSubscriptionRef(parsed)).toEqual(expandedSubscriptionRef);
  });

  it('returns null when neither root nor nested subscription reference exists', () => {
    const parsed = stripeEventWithSubscriptionRefSchema.parse({
      id: 'in_test_REDACTED',
      object: 'invoice',
      subscription: null,
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: null,
        },
      },
    });

    expect(extractSubscriptionRef(parsed)).toBeNull();
  });

  it('preserves passthrough semantics for unrelated extra fields', () => {
    const parsed = stripeEventWithSubscriptionRefSchema.parse({
      ...createCloverInvoicePayload(),
      billing_reason: 'subscription_cycle',
      custom_extra_field: {
        still: 'present',
      },
    });

    expect(parsed).toMatchObject({
      billing_reason: 'subscription_cycle',
      custom_extra_field: {
        still: 'present',
      },
    });
    expect(extractSubscriptionRef(parsed)).toBe(CLOVER_NESTED_SUBSCRIPTION_REF);
  });
});

// #1167 review: a timestamp outside the JavaScript Date range would become an
// Invalid Date deep in the write path; it must fail here, as an invalid payload.
describe('stripeSubscriptionSchema timestamps', () => {
  const subscription = (overrides: Record<string, unknown>) => ({
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    start_date: 1_696_000_000,
    billing_cycle_anchor: 1_696_604_800,
    items: {
      data: [{ current_period_end: 1_800_000_000, price: { id: 'price_1' } }],
    },
    ...overrides,
  });

  it('accepts the latest timestamp a Date can hold', () => {
    expect(
      stripeSubscriptionSchema.safeParse(
        subscription({ start_date: 8_640_000_000_000 }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ['a start date past the Date range', { start_date: 8_640_000_000_001 }],
    ['a fractional billing anchor', { billing_cycle_anchor: 1_696_604_800.5 }],
    ['a negative billing anchor', { billing_cycle_anchor: -1 }],
    [
      'a period end past the Date range',
      {
        items: {
          data: [
            {
              current_period_end: 8_640_000_000_001,
              price: { id: 'price_1' },
            },
          ],
        },
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(
      stripeSubscriptionSchema.safeParse(subscription(overrides)).success,
    ).toBe(false);
  });
});
