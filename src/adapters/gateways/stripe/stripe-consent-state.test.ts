import { describe, expect, it } from 'vitest';
import {
  createStripeConsentStateSignature,
  isValidStripeConsentStateSignature,
} from './stripe-consent-state';

const stateSecret = 'consent-state-test-secret';

const metadata = {
  consent_plan: 'monthly',
  consent_amount_cents: '2900',
  consent_currency: 'usd',
};

describe('Stripe consent state signature', () => {
  it('signs the sorted-key JSON of the metadata with HMAC-SHA256', () => {
    // Known-answer vector: HMAC-SHA256 of
    // {"consent_amount_cents":"2900","consent_currency":"usd","consent_plan":"monthly"}.
    // Sessions created before a deploy are verified after it, so this must not drift.
    expect(createStripeConsentStateSignature(metadata, stateSecret)).toBe(
      '06ab791399e95c983433db3ab89d87e731deca198b041f45dd00e9fb282705fb',
    );
  });

  it('signs the same metadata identically regardless of key order', () => {
    const reordered = {
      consent_currency: 'usd',
      consent_plan: 'monthly',
      consent_amount_cents: '2900',
    };

    expect(createStripeConsentStateSignature(reordered, stateSecret)).toBe(
      createStripeConsentStateSignature(metadata, stateSecret),
    );
  });

  it('accepts a signature over metadata returned in a different key order', () => {
    const signature = createStripeConsentStateSignature(metadata, stateSecret);
    const returnedMetadata = {
      consent_amount_cents: '2900',
      consent_currency: 'usd',
      consent_plan: 'monthly',
    };

    expect(
      isValidStripeConsentStateSignature(
        returnedMetadata,
        signature,
        stateSecret,
      ),
    ).toBe(true);
  });

  it('rejects a signature when a signed value changes', () => {
    const signature = createStripeConsentStateSignature(metadata, stateSecret);

    expect(
      isValidStripeConsentStateSignature(
        { ...metadata, consent_amount_cents: '1' },
        signature,
        stateSecret,
      ),
    ).toBe(false);
  });

  it('rejects a signature when a signed key is removed', () => {
    const signature = createStripeConsentStateSignature(metadata, stateSecret);
    const { consent_currency: _removed, ...withoutCurrency } = metadata;

    expect(
      isValidStripeConsentStateSignature(
        withoutCurrency,
        signature,
        stateSecret,
      ),
    ).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const signature = createStripeConsentStateSignature(
      metadata,
      'another-secret',
    );

    expect(
      isValidStripeConsentStateSignature(metadata, signature, stateSecret),
    ).toBe(false);
  });

  it.each([
    ['a truncated', (signature: string) => signature.slice(0, -2)],
    ['a non-hex', (signature: string) => 'z'.repeat(signature.length)],
    ['an empty', () => ''],
  ])('rejects %s signature without throwing', (_label, corrupt) => {
    const signature = createStripeConsentStateSignature(metadata, stateSecret);

    expect(
      isValidStripeConsentStateSignature(
        metadata,
        corrupt(signature),
        stateSecret,
      ),
    ).toBe(false);
  });
});
