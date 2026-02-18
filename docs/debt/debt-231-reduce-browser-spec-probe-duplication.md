# DEBT-231: Reduce Browser Spec Probe Component Duplication

**Status:** Open
**Priority:** P3
**Date:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

---

## Description

`use-practice-session-page-controller.browser.spec.tsx` is **1,457 lines** with **13 declared tests** - an average of **112 lines per test**. This is the worst lines-per-test ratio among the current files over 1,000 lines.

The primary bloat comes from multiple nearly identical wrapper/probe components:

- `PracticeSessionPageControllerHookProbe`
- `PracticeSessionPageControllerNavigationProbe`
- `PracticeSessionPageControllerBookmarkProbe`
- (and others)

Each probe follows the same pattern: render hook output into DOM elements for assertion. The probes differ mainly in which fields they expose, but the structure is duplicated.

Additionally, `vi.mock()` setup at the file top (~25 lines) could be extracted.

**Disposition:** Test file bloated with duplicated wrapper components.

## Impact

- 112 lines/test is 4-5x the healthy ratio
- Adding new tests requires copying another massive probe component
- Merge conflicts when multiple developers modify probes

## Why This Is Worth Fixing

- **Robustness gain:** shared probe construction reduces copy/paste drift across behavior tests.
- **Complexity risk to avoid:** do not build a generic test DSL; keep one focused probe factory with explicit fields.

## Resolution

1. Create a reusable `createTestProbe()` factory that accepts a selector config (which fields to expose) instead of duplicating full component definitions
2. Extract mock setup into a shared helper (e.g., `practice-session-page-controller.browser.setup.ts`)
3. Target: reduce to ~900-1,000 lines (saving 400-500 lines)

Guardrail: preserve current test readability by keeping scenario assertions explicit even if setup is abstracted.

## Verification

- [ ] Probe components consolidated to factory or parametrized component
- [ ] Mock setup extracted to shared helper
- [ ] All 13 tests still pass: `pnpm test:browser`
- [ ] File under 1,100 lines

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) - Similar duplication pattern in tests
