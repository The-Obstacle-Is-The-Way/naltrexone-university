# DEBT-231: Reduce Browser Spec Probe Component Duplication

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-18
**Resolved:** 2026-02-19
**Last Verified:** 2026-02-19
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

---

## Description

`use-practice-session-page-controller.browser.spec.tsx` was reduced from **1,458 lines** to **1,099 lines** while retaining **13 passing tests** (about **85 lines per test**). The file previously had the worst lines-per-test ratio among the files over 1,000 lines.

The file defines **7 probe/wrapper components**, each rendering a different subset of the hook's API into DOM elements for assertion:

1. `PracticeSessionPageControllerHookProbe` — basic state (loadState, isPending, question, canSubmit)
2. `PracticeSessionPageControllerNavigationProbe` — adds submitResult tracking + next/navigate buttons
3. `PracticeSessionPageControllerBookmarkProbe` — bookmark operations with `useEffect` version counting
4. `PracticeSessionPageControllerBookmarkPendingProbe` — minimal bookmark pending state
5. `PracticeSessionPageControllerReviewProbe` — review state with conditional activeView rendering
6. `PracticeSessionPageControllerSubmitDuringReviewProbe` — submit-during-review transition tracking
7. `PracticeSessionPageControllerMarkForReviewProbe` — mark-for-review toggle state

The probes are **structurally distinct** (each exposes different data-testid fields and some have custom hooks logic), but they share common patterns: rendering hook state into divs and wiring button onClick handlers. The duplication is in the *scaffolding pattern*, not in identical code.

Additionally, `vi.hoisted()` + `vi.mock()` setup was extracted into a dedicated browser setup helper module.

**Disposition:** Test file with repetitive probe scaffolding patterns that inflate line count.

## Impact

- 112 lines/test is 4-5x the healthy ratio
- Adding new tests requires creating another full probe component
- Merge conflicts when multiple developers modify probes

## Why This Is Worth Fixing

- **Robustness gain:** shared probe scaffolding reduces copy/paste drift across behavior tests.
- **Complexity risk to avoid:** probes are structurally distinct (not identical), so a monolithic `createTestProbe()` factory may not fit cleanly. Prefer extracting common *patterns* (button groups, state renderers) over a single generic factory.

## Resolution

1. Extract shared patterns into `renderHookState()` and `renderActionButtons()` for repeated state and button scaffolding
2. Extract `vi.hoisted()` + `vi.mock()` setup into `practice-session-page-controller.browser.setup.ts`
3. Keep each probe as a named component in `practice-session-page-controller.browser.probes.tsx` while removing duplicate JSX scaffolding
4. Land at `1,099` lines (within the 1,000-1,100 target band) with all test assertions unchanged

Guardrail: preserve current test readability by keeping scenario assertions explicit even if scaffolding is abstracted. Do not force all 7 probes into one generic factory — they serve different feature concerns.

## Verification

- [x] Shared probe scaffolding extracted (`renderHookState`, `renderActionButtons`)
- [x] Mock setup extracted to shared helper
- [x] All 13 tests still pass: `pnpm test:browser`
- [x] File under 1,100 lines (`1,099`)

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
- [DEBT-204](debt-204-stripe-payment-gateway-test-god-file.md) - Similar duplication pattern in tests
