# DEBT-226: Playwright E2E Timeout Policy and Import Convention Are Undocumented

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-17
**Component:** E2E Test Infrastructure

---

## Description

Code review repeatedly flags two E2E style decisions that are currently implicit but not documented as project policy:

1. `test.setTimeout(...)` usage and value consistency in `tests/e2e/**/*.spec.ts`
2. Relative helper imports (`./helpers/...`) in E2E specs versus global `@/...` alias preference

Current behavior is internally consistent enough to work, but because policy is undocumented in SSOT docs, each PR re-litigates the same choices.

## Evidence (Current State)

### Rebase Validation Snapshot (2026-02-17)

- `tests/e2e` spec files: **18**
- Files using `test.setTimeout(...)`: **13**
- Total `test.setTimeout(...)` occurrences: **15**
- Timeout values currently in use:
  - `120_000`: **7**
  - `180_000`: **7**
  - `300_000`: **1**
- `test.slow()` occurrences in E2E specs: **0**
- `playwright.config.ts` has `webServer.timeout` but no top-level Playwright test policy fields (`timeout`, `expect.timeout`)
- Alias imports (`@/...`) in `tests/e2e/**/*.spec.ts` and `tests/e2e/**/*.ts`: **0**
- Relative `./helpers/...` imports in E2E specs: **45**

### Timeout Inventory Notes

- The single `300_000` outlier is in `tests/e2e/bs-019-action-bar-audit.spec.ts`
- `tests/e2e/bs-020-card-contrast-audit.spec.ts` contains 3 `test.setTimeout(...)` calls
- `tests/e2e/bs-019-action-bar-audit.spec.ts` contains 1 `test.setTimeout(...)` call (the `300_000` outlier)

### Policy Gap

Current docs do not define a clear E2E timeout/import convention:

- `AGENTS.md` says "Prefer importing via `@/...` alias" globally, with no E2E scoped exception
- `playwright.config.ts` configures web server startup timeout only
- No single doc states when to use default timeout vs `expect` timeout vs `test.setTimeout` vs `test.slow`

### Audit Commands (repeatable)

```bash
# Count E2E spec files
rg --files tests/e2e -g '*.spec.ts' | wc -l

# Timeout usage and value distribution
rg -n "test\\.setTimeout\\(" tests/e2e -g '*.spec.ts'
rg -n "test\\.setTimeout\\(([^)]*)\\)" tests/e2e -g '*.spec.ts' \
  | sed -E 's/.*test\\.setTimeout\\(([^)]*)\\).*/\\1/' | sort | uniq -c
rg -n "test\\.slow\\(" tests/e2e -g '*.spec.ts'

# Import convention usage
rg -n "@/" tests/e2e -g '*.spec.ts' -g '*.ts'    # expect 0
rg -n "from './helpers/" tests/e2e -g '*.spec.ts' | wc -l

# Playwright global timeout fields
rg -n "timeout|expect" playwright.config.ts
```

## Why This Is Not DEBT-225

- **DEBT-225:** Vitest unit/component cold-import timeout behavior (`pnpm test --run`)
- **DEBT-226:** Playwright E2E timeout/import policy clarity (`pnpm test:e2e`)

Shared theme: timeout discipline. Different runtime, tooling, and failure mode.

## Impact

- Repeated review churn on otherwise intentional E2E patterns
- Inconsistent timeout values without explicit rationale trail
- Onboarding friction (contributors infer standards from existing files)
- Higher risk of style drift in future E2E additions

## Resolution Plan

### Part 1: Publish explicit E2E import convention

Document one policy for `tests/e2e/**` imports, including scoped exception behavior if needed.

Recommended convention:

- Use relative imports for E2E-local helpers: `./helpers/...`
- Use `@/...` for app/src/lib imports outside `tests/e2e/**`

### Part 2: Define Playwright timeout policy hierarchy

Document concrete usage rules for:

- Global config `timeout`
- Global config `expect.timeout`
- Per-assertion timeout overrides
- `test.slow()`
- `test.setTimeout(...)`

At minimum, document:

- Default baseline values
- Approved bands for common flow types
- Required rationale comment format for outliers

### Part 3: Normalize current suite or document explicit exceptions

- Keep existing values only with explicit rationale comments
- Evaluate reduction of `300_000` outlier, or justify why it cannot be reduced yet
- Avoid introducing additional ad-hoc values without policy reference

### Part 4: Add a lightweight guardrail

- Add checklist item in PR/review docs for E2E timeout/import policy compliance
- If churn continues, add a small CI script to detect new disallowed timeout values or import-style drift

### Part 5: Update SSOT locations (not just one doc)

Document the policy in at least:

- `AGENTS.md` (scoped E2E exception from global alias preference, if adopted)
- `docs/dev/testing-infrastructure.md` (Playwright timeout hierarchy and examples)

## Acceptance Criteria

- [x] E2E import convention is explicitly documented with scoped rules for `tests/e2e/**`
- [x] Playwright timeout policy is documented with concrete rules and baseline values
- [x] Existing `test.setTimeout` values are standardized or justified with concise comments
- [x] The `300_000` outlier is reduced or explicitly justified in-file
- [x] Review guidance references the policy, reducing repeat style comments
- [ ] One full PR cycle completes with no recurring timeout/import-style review churn (post-merge verification)

## References

- [Playwright Test Timeouts](https://playwright.dev/docs/test-timeouts)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API: `test.slow`](https://playwright.dev/docs/api/class-test#test-slow)

## Related

- [DEBT-225](debt-225-vitest-cold-import-timeout-flakes.md) - Vitest cold-import timeout flakes
- [DEBT-110](debt-110-e2e-helper-anti-patterns.md) - prior E2E timeout misuse (`isVisible({ timeout })`)
