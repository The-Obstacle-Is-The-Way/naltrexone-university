import { DomainError } from '../errors/domain-errors';

// DEBT-414 F02: locating the yearly reminder for a monthly subscription.
//
// Stripe bills a monthly subscription on the billing cycle anchor's day of
// month, clamped to the last day of shorter months, counting each renewal from
// the anchor rather than from the previous renewal, in UTC (January 31 ->
// February 28 -> March 31).

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addBillingMonths(anchor: Date, months: number): Date {
  const monthIndex = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

// The renewal that extends continuous service beyond a twelve-month mark is
// the last renewal at or before it: its new period is the one that crosses the
// mark. Returns the first such renewal at or after `notBefore`.
export function nextAnniversaryRenewalAt(input: {
  startedAt: Date;
  billingCycleAnchor: Date;
  notBefore: Date;
}): Date {
  // An invalid instant compares false with everything, so the search below
  // would never end.
  if (
    [input.startedAt, input.billingCycleAnchor, input.notBefore].some(
      (instant) => Number.isNaN(instant.getTime()),
    )
  ) {
    throw new DomainError(
      'INVALID_SUBSCRIPTION_DATES',
      'Subscription anniversary dates must be valid instants',
    );
  }
  const notBefore = input.notBefore.getTime();
  let renewals = 1;
  for (let year = 1; ; year += 1) {
    const mark = addBillingMonths(input.startedAt, 12 * year).getTime();
    while (
      addBillingMonths(input.billingCycleAnchor, renewals + 1).getTime() <= mark
    ) {
      renewals += 1;
    }
    const renewal = addBillingMonths(input.billingCycleAnchor, renewals);
    if (renewal.getTime() <= mark && renewal.getTime() >= notBefore) {
      return renewal;
    }
  }
}
