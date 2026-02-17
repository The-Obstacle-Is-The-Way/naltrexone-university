# DEBT-226: Playwright E2E Timeout Policy and Import Convention Are Undocumented

**Status:** Open
**Priority:** P3
**Date:** 2026-02-17
**Component:** E2E Test Infrastructure

---

## Description

CodeRabbit feedback repeatedly targets two E2E conventions:

1. `test.setTimeout(...)` usage and timeout value consistency
2. Relative helper imports in `tests/e2e/**` versus global alias preference

After codebase-wide audit, the current behavior is mostly intentional, but the intent is not documented in SSOT docs. This creates recurring review noise and inconsistent style decisions across contributors.

## Evidence (Current State)

### Timeout patterns

- `tests/e2e` contains **18** `*.spec.ts` files
- **13 files** use `test.setTimeout(...)` (**15 total occurrences**)
- Current suite-level timeout values:
  - `120_000` (7 occurrences)
  - `180_000` (7 occurrences)
  - `300_000` (1 occurrence)
- `test.slow()` usage in `tests/e2e/**/*.spec.ts`: **0 occurrences**
- `playwright.config.ts` defines `webServer.timeout`, but no top-level Playwright test timeout policy (`timeout`, `expect.timeout`) for suite standards

### Import patterns

- Alias imports (`@/...`) in `tests/e2e/**/*.spec.ts` and `tests/e2e/**/*.ts`: **0**
- Relative helper imports (`./helpers/...`) in E2E specs: **45**
- Pattern is highly consistent within E2E, but global guidance currently says to “Prefer importing via `@/...` alias” (AGENTS.md), with no E2E-specific exception documented

## Why This Is Not DEBT-225

This debt is adjacent to DEBT-225 but not the same problem:

- **DEBT-225**: Vitest cold-import timeout flakes in unit/component tests (`pnpm test --run`)
- **DEBT-226**: Playwright E2E timeout/import convention clarity (`pnpm test:e2e`)

Shared theme: timeout discipline and consistency.

Different root causes: Vitest module-load budget vs. Playwright end-to-end flow budgets.

## Impact

- **Review churn**: repeat CodeRabbit comments on already-intentional patterns
- **Policy ambiguity**: contributors can’t tell when `test.setTimeout` is preferred vs `test.slow`
- **Style drift risk**: timeout values may keep diverging without rationale
- **Onboarding friction**: E2E conventions are inferred from examples, not documented standards

## Resolution Plan

1. **Document E2E import convention explicitly**
   - Decide and state one policy for `tests/e2e/**` (relative helper imports vs alias imports)
   - Record this as a scoped exception if it differs from global alias preference

2. **Define Playwright timeout policy**
   - Clarify when to use:
     - default timeouts,
     - `expect(..., { timeout })`,
     - `test.setTimeout(...)`,
     - `test.slow()`
   - Define approved timeout bands and required rationale for outliers

3. **Normalize or justify outliers**
   - Keep existing values where justified
   - Add concise rationale comments for exceptional values (e.g., `300_000`) or reduce them

4. **Add a lightweight guardrail**
   - Add PR checklist/docs checklist item for E2E timeout/import policy compliance
   - Optional: add a simple script check if drift recurs

## Acceptance Criteria

- [ ] E2E import convention is explicitly documented in SSOT docs
- [ ] E2E timeout policy is documented with concrete usage rules
- [ ] Existing `test.setTimeout` values are either standardized or explicitly justified
- [ ] Review guidance references the policy to reduce repeat false-positive style comments
- [ ] DEBT-226 is closed after one full PR cycle with no recurring timeout/import-style review churn

## References

- [Playwright Test Timeouts](https://playwright.dev/docs/test-timeouts)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API: `test.slow`](https://playwright.dev/docs/api/class-test#test-slow)

## Related

- [DEBT-225](debt-225-vitest-cold-import-timeout-flakes.md) — Vitest cold-import timeout flakes
- [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) — Prior E2E timeout misuse (`isVisible({ timeout })`)
