# DEBT-110: E2E Test Helper Anti-Patterns (isVisible Timeout + Stripe Duplication)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-05

---

## Description

Two related anti-patterns exist in E2E test helpers and specs, discovered during CodeRabbit review of PR #56.

### 1. `isVisible({ timeout })` is a silent no-op (11 instances)

Playwright's `locator.isVisible()` does **not** accept a `timeout` parameter — it returns immediately. Passing `{ timeout }` is silently ignored. Every call that relies on timeout-based polling is actually a synchronous check that may return `false` before the element renders.

**Affected files:**

| File | Lines | Call | Impact |
|------|-------|------|--------|
| `tests/e2e/helpers/subscription.ts` | 12, 15, 18, 21 | `.isVisible({ timeout: 10_000 })` | Stripe card fields may not be detected if checkout form hasn't rendered |
| `tests/e2e/helpers/subscription.ts` | 35 | `.isVisible({ timeout: 10_000 })` | "Already subscribed" check returns instantly — may miss slow-loading text |
| `tests/e2e/helpers/bookmark.ts` | 12 | `.isVisible({ timeout: 500 })` | Bookmark/Remove button detection is instant, not 500ms polling |
| `tests/e2e/helpers/bookmark.ts` | 58 | `.isVisible({ timeout: 1_000 })` | Remove button detection on bookmarks page is instant |
| `tests/e2e/subscribe.spec.ts` | 41, 44, 47, 50 | `.isVisible({ timeout: 10_000 })` | Inline Stripe checkout has same issue as helper |

**Why this hasn't caused failures yet:** Stripe checkout and subscription pages tend to load before the test reaches them (preceding navigation assertions act as implicit waits). But this is luck-dependent, not correct.

### 2. `subscribe.spec.ts` duplicates inline Stripe checkout (DRY violation)

`subscribe.spec.ts:28-52` contains an inline copy of the Stripe Checkout flow that already exists in `helpers/subscription.ts` as `completeStripeCheckout`. The helper was extracted and refactored (frameLocator extracted, timeout added to redirect assertion), but the inline copy in `subscribe.spec.ts` was not updated to use it.

## Impact

- **Flaky E2E tests** — `isVisible()` returning instantly means race conditions on slow CI runners
- **Maintenance drift** — Stripe checkout improvements to the helper don't propagate to the inline copy
- **False confidence** — Developers think there's a 10s wait; there isn't

## Resolution

### Fix 1: Replace `isVisible({ timeout })` with proper Playwright waits

```typescript
// Before (broken — timeout silently ignored):
if (await cardNumber.isVisible({ timeout: 10_000 })) {

// After (correct — waitFor respects timeout):
const isCardVisible = await cardNumber
  .waitFor({ state: 'visible', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
if (isCardVisible) {
```

Or use `expect(...).toBeVisible({ timeout })` where appropriate.

### Fix 2: Refactor `subscribe.spec.ts` to use shared helper

Export `completeStripeCheckout` from `helpers/subscription.ts` and use it in `subscribe.spec.ts`, or restructure the test to use `ensureSubscribed`.

## Verification

1. [ ] All `isVisible({ timeout })` calls replaced with `waitFor` or `toBeVisible`
2. [ ] `subscribe.spec.ts` no longer duplicates Stripe checkout logic
3. [ ] `grep -rn 'isVisible({' tests/e2e/` returns zero results
4. [ ] E2E tests still pass (if credentials available)

## Related

- PR #56 CodeRabbit review (flagged `question.ts:53` instance, which was fixed)
- DEBT-107: Question Engine E2E Completeness
- DEBT-104: Missing E2E Test Credentials
