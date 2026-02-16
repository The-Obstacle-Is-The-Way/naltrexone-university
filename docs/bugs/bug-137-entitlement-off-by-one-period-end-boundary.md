# BUG-137: Entitlement Check Off-by-One at Period End Boundary

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

`isEntitled()` in the domain entitlement service uses `<=` to compare `currentPeriodEnd` against `now`, which denies access at the exact millisecond the period ends. Standard subscription semantics grant access *through* the end of the period.

**Observed:** `isEntitled()` returns `false` when `currentPeriodEnd === now` (exact timestamp match).

**Expected:** Users should retain access through the final moment of their subscription period (`currentPeriodEnd > now` means denied, `currentPeriodEnd === now` means still entitled).

## Steps to Reproduce

1. Create a subscription where `currentPeriodEnd` equals the current time exactly
2. Call `isEntitled(subscription, now)` where `now.getTime() === subscription.currentPeriodEnd.getTime()`
3. Returns `false` (denied) instead of `true` (entitled)

## Root Cause

`src/domain/services/entitlement.ts:13`:
```typescript
if (subscription.currentPeriodEnd <= now) return false;
```

Should be:
```typescript
if (subscription.currentPeriodEnd < now) return false;
```

## Impact Assessment

**Low practical impact.** The window where `currentPeriodEnd` and `now` share the exact same millisecond timestamp is extremely narrow. However, this is a correctness issue that misrepresents the domain rule.

## Fix

Change `<=` to `<`:
```typescript
if (subscription.currentPeriodEnd < now) return false;
```

## Verification

- [ ] Unit test: `it('returns true when currentPeriodEnd equals now')`
- [ ] Verify existing entitlement tests still pass

## Related

- `src/domain/services/entitlement.ts:7-15`
- Stripe convention: subscriptions are active through `current_period_end`
