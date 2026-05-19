import { describe, expect, it } from 'vitest';
import {
  extractSubscriptionRef,
  stripeEventWithSubscriptionRefSchema,
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
