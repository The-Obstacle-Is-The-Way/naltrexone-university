# DEBT-205: E2E Test Selectors Drifted from UI Refactors

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-10
**Resolved:** 2026-02-10

---

## Description

Before resolution, 7 of 16 E2E tests failed due to selector mismatches between Playwright helpers and the current UI. The root cause was UI refactors (choice buttons, practice start form, label copy) without corresponding E2E selector updates.

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

Implemented selector fixes by updating:

1. `tests/e2e/helpers/question.ts` — `selectChoiceByLabel()` now matches the ChoiceButton DOM.
2. `tests/e2e/helpers/session.ts` — `startSession()` now clicks SegmentedControl buttons and fills the `Questions` input.
3. `tests/e2e/bookmarks.spec.ts` — stabilized empty-state assertion after removal.

Prevent-future-drift ideas remain valid, but are out of scope for this resolved item.

## Verification

- `pnpm test:e2e` — all E2E tests pass

## Related

- BUG-129: Choice radio selector mismatch
- BUG-130: Session start selector mismatch
- BUG-131: Bookmarks empty state assertion
- DEBT-110 (resolved): E2E Test Helper Anti-Patterns
- DEBT-104 (resolved): Missing E2E Test Credentials
