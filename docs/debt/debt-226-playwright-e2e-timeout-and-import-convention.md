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
  - `300_000` (1 occurrence — `bs-019-action-bar-audit.spec.ts`, 4-test suite with Clerk + Stripe + multi-question flows)
- `test.slow()` usage in `tests/e2e/**/*.spec.ts`: **0 occurrences**
- `playwright.config.ts` defines `webServer.timeout` only — no `timeout`, `expect.timeout`, `actionTimeout`, or `navigationTimeout` at config level (all use Playwright defaults: 30s test, 5s expect, 30s action, 30s navigation)

#### Inline timeout overrides (~73 instances beyond `test.setTimeout`)

The suite-level timeouts are only part of the picture. Across E2E specs and helpers:

| Pattern | Count | Common values |
|---------|-------|---------------|
| `.toBeVisible({ timeout })`, `.toHaveURL({ timeout })`, etc. | ~67 | `15_000`, `10_000`, `30_000` |
| `page.goto(..., { timeout })` | ~21 | `60_000` (with `waitUntil: 'domcontentloaded'`) |
| `locator.waitFor({ timeout })` | ~10 | `10_000`, `15_000` |
| `page.waitForURL({ timeout })` | 1 | `15_000` |
| `page.waitForFunction({ timeout })` | 1 | `5_000` |

These inline overrides are the **de facto timeout policy** — the config is silent, so every timeout is set per-call.

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

2. **Define Playwright timeout policy with concrete bands**
   - Clarify when to use each mechanism (`test.setTimeout`, `test.slow`, inline `{ timeout }`, config defaults)
   - Proposed timeout bands based on current usage patterns:

     | Band | Value | Use case |
     |------|-------|----------|
     | Immediate | `1_000–5_000` | Error state checks, negation assertions, fast element presence |
     | Standard | `10_000–15_000` | Element visibility after async ops, heading loads, navigation waits |
     | Extended | `30_000` | Async data loads, loading-text hide, form submission feedback |
     | Navigation | `60_000` | `page.goto()` with `waitUntil: 'domcontentloaded'` (server startup + SSR) |
     | Suite: Standard | `120_000` | Multi-test suites with Clerk auth + basic page interactions |
     | Suite: Audit | `180_000` | Multi-test audit suites with multi-page navigation + screenshots |
     | Suite: Mega | `300_000` | Exceptional multi-step suites only — **requires inline comment with rationale** |

   - Values outside these bands require a comment justifying the deviation

3. **Normalize or justify outliers**
   - Keep existing values where justified
   - Add concise rationale comments for exceptional values (e.g., `300_000`) or reduce them

4. **Add a lightweight guardrail**
   - Add PR checklist/docs checklist item for E2E timeout/import policy compliance
   - Optional: add a simple script check if drift recurs

## Acceptance Criteria

- [ ] E2E import convention is explicitly documented (in AGENTS.md or `.claude/rules/`)
- [ ] E2E timeout bands are documented with concrete usage rules
- [ ] `playwright.config.ts` sets sensible defaults (`timeout`, `expect.timeout`) so inline overrides are the exception, not the rule
- [ ] Existing `test.setTimeout` values are either standardized or explicitly justified with inline comments
- [ ] The `300_000` outlier in `bs-019` has an inline rationale comment
- [ ] AGENTS.md or `.claude/rules/` has an E2E testing section (currently missing — only Vitest is documented)
- [ ] Review guidance references the policy to reduce repeat false-positive style comments
- [ ] DEBT-226 is closed after one full PR cycle with no recurring timeout/import-style review churn

## References

- [Playwright Test Timeouts](https://playwright.dev/docs/test-timeouts)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API: `test.slow`](https://playwright.dev/docs/api/class-test#test-slow)

## Related

- [DEBT-225](debt-225-vitest-cold-import-timeout-flakes.md) — Vitest cold-import timeout flakes
- [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) — Prior E2E timeout misuse (`isVisible({ timeout })`)
