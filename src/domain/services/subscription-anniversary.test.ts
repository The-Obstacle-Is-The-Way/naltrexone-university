import { describe, expect, it } from 'vitest';
import {
  addBillingMonths,
  nextAnniversaryRenewalAt,
} from './subscription-anniversary';

const at = (iso: string) => new Date(iso);

describe('addBillingMonths', () => {
  it('keeps the day and time of day', () => {
    expect(addBillingMonths(at('2026-01-15T10:30:00.000Z'), 1)).toEqual(
      at('2026-02-15T10:30:00.000Z'),
    );
  });

  it('clamps a month-end anchor to the last day of a shorter month', () => {
    expect(addBillingMonths(at('2026-01-31T12:00:00.000Z'), 1)).toEqual(
      at('2026-02-28T12:00:00.000Z'),
    );
  });

  it('uses February 29 in a leap year', () => {
    expect(addBillingMonths(at('2028-01-31T12:00:00.000Z'), 1)).toEqual(
      at('2028-02-29T12:00:00.000Z'),
    );
  });

  it('counts from the anchor, so a clamped month does not shorten later ones', () => {
    expect(addBillingMonths(at('2026-01-31T12:00:00.000Z'), 2)).toEqual(
      at('2026-03-31T12:00:00.000Z'),
    );
  });

  it('rolls into later years', () => {
    expect(addBillingMonths(at('2026-11-30T08:00:00.000Z'), 15)).toEqual(
      at('2028-02-29T08:00:00.000Z'),
    );
  });

  it('works in UTC whatever the local offset of the instant', () => {
    // 2026-03-31T23:30Z is already April 1 in UTC+1; Stripe anchors in UTC.
    expect(addBillingMonths(at('2026-03-31T23:30:00.000Z'), 1)).toEqual(
      at('2026-04-30T23:30:00.000Z'),
    );
  });
});

// DEBT-414 F02: the renewal that extends continuous service beyond each
// twelve-month period is the last renewal at or before that period's end.
describe('nextAnniversaryRenewalAt', () => {
  it('is the twelfth renewal when service and billing start together', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-15T10:00:00.000Z'),
        notBefore: at('2026-06-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2027-01-15T10:00:00.000Z'));
  });

  it('is the eleventh renewal after a seven-day trial, whose period crosses the year', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-22T10:00:00.000Z'),
        notBefore: at('2026-06-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2026-12-22T10:00:00.000Z'));
  });

  it('includes a renewal exactly at notBefore', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-15T10:00:00.000Z'),
        notBefore: at('2027-01-15T10:00:00.000Z'),
      }),
    ).toEqual(at('2027-01-15T10:00:00.000Z'));
  });

  it('moves to the next year once this year’s renewal has passed', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-15T10:00:00.000Z'),
        notBefore: at('2027-01-15T10:00:00.001Z'),
      }),
    ).toEqual(at('2028-01-15T10:00:00.000Z'));
  });

  it('finds a later year for a long-running subscription', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-22T10:00:00.000Z'),
        notBefore: at('2028-12-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2028-12-22T10:00:00.000Z'));
  });

  it('clamps a month-end start and anchor alike', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-31T09:00:00.000Z'),
        billingCycleAnchor: at('2026-01-31T09:00:00.000Z'),
        notBefore: at('2026-12-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2027-01-31T09:00:00.000Z'));
  });

  it('marks a leap-day start on February 28 of later years', () => {
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2028-02-29T09:00:00.000Z'),
        billingCycleAnchor: at('2028-02-29T09:00:00.000Z'),
        notBefore: at('2028-12-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2029-02-28T09:00:00.000Z'));
  });

  it('takes the renewal before the mark when the anchor falls later in the day', () => {
    // The twelfth renewal, at 18:00, would land after the 10:00 mark.
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-15T18:00:00.000Z'),
        notBefore: at('2026-06-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2026-12-15T18:00:00.000Z'));
  });

  it('skips a year whose mark falls before the first renewal', () => {
    // A thirteen-month first period: no renewal falls in the first year.
    expect(
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2027-02-15T10:00:00.000Z'),
        notBefore: at('2026-02-01T00:00:00.000Z'),
      }),
    ).toEqual(at('2028-01-15T10:00:00.000Z'));
  });

  it.each([
    ['startedAt', { startedAt: new Date(Number.NaN) }],
    ['billingCycleAnchor', { billingCycleAnchor: new Date(Number.NaN) }],
    ['notBefore', { notBefore: new Date(Number.NaN) }],
  ])('rejects an invalid %s instead of searching forever', (_name, invalid) => {
    expect(() =>
      nextAnniversaryRenewalAt({
        startedAt: at('2026-01-15T10:00:00.000Z'),
        billingCycleAnchor: at('2026-01-15T10:00:00.000Z'),
        notBefore: at('2026-06-01T00:00:00.000Z'),
        ...invalid,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_SUBSCRIPTION_DATES',
        message: 'Subscription anniversary dates must be valid instants',
      }),
    );
  });
});
