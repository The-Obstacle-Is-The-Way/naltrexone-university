# DEBT-110: E2E Test Helper Anti-Patterns (isVisible Timeout + Stripe Duplication)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

Two related anti-patterns existed in E2E test helpers and specs, discovered during CodeRabbit review of PR #56.

### 1. `isVisible({ timeout })` — timeout deprecated and ignored (was 11 instances)

Playwright's `locator.isVisible()` accepts a `timeout` parameter, but it is **deprecated and ignored** — the method returns immediately. Passing `{ timeout }` is silently dropped. Every call that relied on timeout-based polling was actually a synchronous check that could return `false` before the element rendered.

### 2. `subscribe.spec.ts` duplicated inline Stripe checkout (DRY violation)

`subscribe.spec.ts` contained an inline copy of the Stripe Checkout flow that already existed in `helpers/subscription.ts` as `completeStripeCheckout`.

## Resolution (Applied)

### Fix 1: Replaced `isVisible({ timeout })` with `waitFor`-based helpers

Introduced `waitVisible()` in `helpers/subscription.ts` and `isButtonVisible()` in `helpers/bookmark.ts`:

```typescript
// waitVisible — generic locator wait that returns boolean
async function waitVisible(
  locator: ReturnType<Page['locator']>,
  timeout: number,
): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}
```

All 11 `isVisible({ timeout })` instances replaced:

| File | Instances | Fix |
|------|-----------|-----|
| `helpers/subscription.ts` | 5 (lines 12,15,18,21,35) | `waitVisible()` helper |
| `helpers/bookmark.ts` | 2 (lines 12,58) | `isButtonVisible()` helper |
| `subscribe.spec.ts` | 4 (lines 41,44,47,50) | Refactored to use `completeStripeCheckout` |

### Fix 2: `assertQuestionSlugExists` timing

Replaced immediate `isVisible()` with `waitFor({ timeout: 2_000 })` to give "Question not found." text time to render before checking.

### Fix 3: Refactored `subscribe.spec.ts` to use shared helper

Exported `completeStripeCheckout` from `helpers/subscription.ts`. `subscribe.spec.ts` now imports and calls the shared helper instead of duplicating inline Stripe checkout code.

## Verification

1. [x] All `isVisible({ timeout })` calls replaced with `waitFor` or `toBeVisible`
2. [x] `subscribe.spec.ts` no longer duplicates Stripe checkout logic
3. [x] `grep -rn 'isVisible({.*timeout' tests/e2e/` returns zero results
4. [ ] E2E tests still pass (requires Clerk/Stripe credentials — see DEBT-104)

## Related

- PR #56 CodeRabbit review (flagged multiple instances)
- DEBT-107: Question Engine E2E Completeness
- DEBT-104: Missing E2E Test Credentials
