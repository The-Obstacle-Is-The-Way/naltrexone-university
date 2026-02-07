# BUG-076: Past-Due Immediate Lockout

**Status:** Reclassified
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-07
**Reclassified To:** [DEBT-136](../debt/debt-136-dunning-grace-period-for-past-due-subscribers.md)

---

## Reclassification Decision

This was validated as a **policy choice**, not a correctness bug against current SSOT.

Per `docs/specs/master_spec.md` Section 4.2, entitlement is granted only when:
- status maps to `active` or `inTrial`
- and `currentPeriodEnd > now`

`pastDue` is explicitly listed as non-entitled in SSOT. Current code matches this exactly:
- `src/domain/value-objects/subscription-status.ts`
- `src/domain/services/entitlement.ts`

## Historical Context

The concern is product-valid (grace period can reduce involuntary churn), but implementing grace access would require an explicit SSOT policy change and updated acceptance criteria for paywall behavior.

Under current spec, immediate lockout for `pastDue` is intentional.

## Follow-Up (If Product Policy Changes)

If the team wants dunning grace-period access, treat this as a feature/spec update:
- update entitlement rules in SSOT
- add status-aware messaging on pricing/app routes
- add tests for grace-period transitions and cutoff behavior

## Related

- `docs/specs/master_spec.md` (Section 4.2 Entitlement)
- `src/domain/value-objects/subscription-status.ts`
- `src/domain/services/entitlement.ts`
- `app/(app)/app/layout.tsx`
- `app/pricing/page.tsx`
