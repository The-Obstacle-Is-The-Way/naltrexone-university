import { describe, expect, it } from 'vitest';
import {
  AllRenewalConsentKinds,
  AllRenewalConsentSources,
  CONSENT_RETENTION_YEARS,
  computeRenewalConsentRetainUntil,
  POST_TERMINATION_RETENTION_YEARS,
} from './renewal-consent';

describe('renewal consent value objects', () => {
  it('enumerates the only supported kinds and sources', () => {
    expect(AllRenewalConsentKinds).toEqual(['initial_offer', 'price_increase']);
    expect(AllRenewalConsentSources).toEqual([
      'stripe_checkout',
      'stripe_setup',
      'application',
    ]);
  });

  it('names the legal retention periods', () => {
    expect(CONSENT_RETENTION_YEARS).toBe(3);
    expect(POST_TERMINATION_RETENTION_YEARS).toBe(1);
  });

  it('keeps the three-year floor when termination occurs earlier', () => {
    expect(
      computeRenewalConsentRetainUntil(
        new Date('2026-08-06T12:00:00Z'),
        new Date('2027-01-01T00:00:00Z'),
      ),
    ).toEqual(new Date('2029-08-06T12:00:00Z'));
  });
});
