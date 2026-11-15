import { describe, expect, it } from 'vitest';
import {
  AllRenewalConsentKinds,
  AllRenewalConsentSources,
  CONSENT_RETENTION_YEARS,
  computeConsentRetentionFloor,
  computeTerminationRetentionFloor,
  POST_TERMINATION_RETENTION_YEARS,
} from './renewal-consent';

describe('renewal consent value objects', () => {
  it('rejects a termination date passed to the consent floor calculator', () => {
    const acceptedAt = new Date('2026-08-06T12:00:00Z');
    const terminatedAt = new Date('2027-01-01T00:00:00Z');
    const invalidCall = () => {
      // @ts-expect-error A consent floor accepts only the acceptance date.
      return computeConsentRetentionFloor(acceptedAt, terminatedAt);
    };
    expect(invalidCall).toBeTypeOf('function');
  });

  it('rejects an acceptance date passed to the termination floor calculator', () => {
    const acceptedAt = new Date('2026-08-06T12:00:00Z');
    const terminatedAt = new Date('2027-01-01T00:00:00Z');
    const invalidCall = () => {
      // @ts-expect-error A termination floor accepts only the termination date.
      return computeTerminationRetentionFloor(acceptedAt, terminatedAt);
    };
    expect(invalidCall).toBeTypeOf('function');
  });

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

  it('keeps the three-year floor without a termination, however old the consent', () => {
    expect(
      computeConsentRetentionFloor(new Date('1960-01-01T00:00:00Z')),
    ).toEqual(new Date('1963-01-01T00:00:00Z'));
  });

  it('computes the termination floor alone without inventing a consent date', () => {
    expect(
      computeTerminationRetentionFloor(new Date('1960-02-29T12:00:00Z')),
    ).toEqual(new Date('1961-03-01T12:00:00Z'));
  });
});
