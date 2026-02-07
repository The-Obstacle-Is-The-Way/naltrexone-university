# DEBT-136: Dunning Grace Period for Past-Due Subscribers

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07
**Reclassified From:** BUG-076

---

## Description

Currently, `pastDue` subscribers are immediately locked out of content. This matches the SSOT (master_spec Section 4.2: entitlement requires `active` or `inTrial` with `currentPeriodEnd > now`), so current behavior is correct.

However, a grace period for `pastDue` subscribers is a standard SaaS pattern that reduces involuntary churn. This is a nice-to-have feature for the future, not a bug.

## Impact

- Users with a failed payment are immediately locked out, even if the payment failure is transient (e.g., expired card, temporary bank hold)
- Stripe retries payments over a configurable dunning window (typically 1-4 weeks)
- Immediate lockout during this window may frustrate users who intend to remain subscribed
- Low priority: Stripe's dunning emails handle most recovery; lockout is a deliberate safety-first policy

## Resolution

If the team wants dunning grace-period access:

1. Update entitlement rules in SSOT (`docs/specs/master_spec.md` Section 4.2) to grant access for `pastDue` status
2. Add status-aware messaging on pricing/app routes (e.g., "Your payment failed — please update your card")
3. Add tests for grace-period transitions and cutoff behavior
4. Optionally add a configurable grace window (e.g., 7 days after first payment failure)

## Verification

- [ ] SSOT updated with explicit grace-period policy
- [ ] Entitlement service grants access for `pastDue` within grace window
- [ ] UI shows payment recovery messaging for grace-period users
- [ ] Tests cover grace-period transitions and hard cutoff

## Related

- `docs/specs/master_spec.md` (Section 4.2 Entitlement)
- `src/domain/value-objects/subscription-status.ts`
- `src/domain/services/entitlement.ts`
- `app/(app)/app/layout.tsx`
- `app/pricing/page.tsx`
- Former BUG-076 (deleted — fully superseded by this document)
