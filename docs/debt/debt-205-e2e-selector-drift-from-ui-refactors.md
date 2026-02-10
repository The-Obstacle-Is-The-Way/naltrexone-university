# DEBT-205: E2E Test Selectors Drifted from UI Refactors

**Status:** Open
**Priority:** P1
**Date:** 2026-02-10

---

## Description

7 of 16 E2E tests fail due to selector mismatches between Playwright test helpers and the current UI. The root cause is that UI components were refactored (choice buttons, practice start form, label copy) without updating the E2E selectors to match.

This was invisible until now because E2E tests were effectively not running — the old `completeStripeCheckout()` helper broke when Stripe changed their hosted checkout DOM, so any test that needed a subscription would fail at the checkout step, masking all downstream failures. With the new API-based subscription seeding (this PR), the subscription step passes and the selector mismatches are exposed.

## Impact

- **7 of 16 E2E tests fail** — practice, review, bookmarks, core-app-pages, subscribe-and-practice
- **9 pass** — smoke, pricing-unauthenticated, dark-mode, theme-preference, marketing-contrast, subscribe (2 setup + 1 test)
- **Unit tests are fully green** — 195 files, 1,229 tests passing
- **Integration tests are fully green** — 4 files, 33 tests passing
- The codebase is healthy. This is purely E2E selector drift, not systemic brittleness.

## Specific Failures

| Bug | Failing Selector | Actual UI | Tests Affected |
|-----|-----------------|-----------|----------------|
| BUG-129 | `getByRole('radio', { name: 'Choice A' })` | Radio is `sr-only`; accessible name is full choice text | 3 tests |
| BUG-130 | `getByLabel('Mode').selectOption()` | SegmentedControl with buttons, not `<select>` | 3 tests |
| BUG-130 | `getByLabel('Count')` | Label is "Questions" | 3 tests (same) |
| BUG-131 | `getByText('No bookmarks yet.')` after remove | Timing/state issue | 1 test |

## Why This Happened

1. **Stripe checkout UI broke** — Stripe changed their hosted checkout DOM, permanently breaking `completeStripeCheckout()`
2. **E2E tests stopped running** — Any test needing subscription failed at checkout, so failures downstream were masked
3. **UI was refactored** — Choice buttons, practice form, and labels were updated (correctly) without E2E updates
4. **No selector-change CI gate** — Nothing enforced that E2E selectors stay in sync with component changes

## Resolution

### Phase 1: Fix the selectors (BUG-129, BUG-130, BUG-131)

1. **`helpers/question.ts`** — Update `selectChoiceByLabel()` to match actual choice button DOM
2. **`helpers/session.ts`** — Update `startSession()` to use button clicks for SegmentedControl and correct "Questions" label
3. **`bookmarks.spec.ts`** — Fix timing/state issue in empty-state assertion

### Phase 2: Prevent future drift

Consider adding a CI comment or lint rule that flags E2E helper changes when components they target are modified. Alternatively, ensure E2E tests run in CI with real credentials so drift is caught immediately.

## Verification

- [ ] `pnpm test:e2e` — all 16 tests pass
- [ ] Run twice to confirm idempotency

## Related

- BUG-129: Choice radio selector mismatch
- BUG-130: Session start selector mismatch
- BUG-131: Bookmarks empty state assertion
- DEBT-110 (resolved): E2E Test Helper Anti-Patterns
- DEBT-104 (resolved): Missing E2E Test Credentials
