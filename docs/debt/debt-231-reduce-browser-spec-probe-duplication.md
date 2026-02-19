# DEBT-231: Reduce Browser Spec Probe Component Duplication

**Status:** Open
**Priority:** P3
**Date:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

---

## Description

`use-practice-session-page-controller.browser.spec.tsx` is **1,458 lines** with **13 declared tests** — an average of **112 lines per test**. This is the worst lines-per-test ratio among the current files over 1,000 lines.

The file defines **7 probe/wrapper components**, each rendering a different subset of the hook's API into DOM elements for assertion:

1. `PracticeSessionPageControllerHookProbe` — basic state (loadState, isPending, question, canSubmit)
2. `PracticeSessionPageControllerNavigationProbe` — adds submitResult tracking + next/navigate buttons
3. `PracticeSessionPageControllerBookmarkProbe` — bookmark operations with `useEffect` version counting
4. `PracticeSessionPageControllerBookmarkPendingProbe` — minimal bookmark pending state
5. `PracticeSessionPageControllerReviewProbe` — review state with conditional activeView rendering
6. `PracticeSessionPageControllerSubmitDuringReviewProbe` — submit-during-review transition tracking
7. `PracticeSessionPageControllerMarkForReviewProbe` — mark-for-review toggle state

The probes are **structurally distinct** (each exposes different data-testid fields and some have custom hooks logic), but they share common patterns: rendering hook state into divs and wiring button onClick handlers. The duplication is in the *scaffolding pattern*, not in identical code.

Additionally, `vi.hoisted()` + `vi.mock()` setup at the file top spans **33 lines** and could be extracted.

**Disposition:** Test file with repetitive probe scaffolding patterns that inflate line count.

## Impact

- 112 lines/test is 4-5x the healthy ratio
- Adding new tests requires creating another full probe component
- Merge conflicts when multiple developers modify probes

## Why This Is Worth Fixing

- **Robustness gain:** shared probe scaffolding reduces copy/paste drift across behavior tests.
- **Complexity risk to avoid:** probes are structurally distinct (not identical), so a monolithic `createTestProbe()` factory may not fit cleanly. Prefer extracting common *patterns* (button groups, state renderers) over a single generic factory.

## Resolution

1. Extract shared patterns: a `renderHookState()` utility for common div-rendering and a `renderActionButtons()` utility for onClick wiring
2. Extract `vi.hoisted()` + `vi.mock()` setup (~33 lines) into a shared helper (e.g., `practice-session-page-controller.browser.setup.ts`)
3. Keep each probe as a named component (they test genuinely different feature subsets) but reduce scaffolding boilerplate within each
4. Target: reduce to ~1,000-1,100 lines (saving 350-450 lines)

Guardrail: preserve current test readability by keeping scenario assertions explicit even if scaffolding is abstracted. Do not force all 7 probes into one generic factory — they serve different feature concerns.

## Verification

- [ ] Probe components consolidated to factory or parametrized component
- [ ] Mock setup extracted to shared helper
- [ ] All 13 tests still pass: `pnpm test:browser`
- [ ] File under 1,100 lines

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) - Similar duplication pattern in tests
