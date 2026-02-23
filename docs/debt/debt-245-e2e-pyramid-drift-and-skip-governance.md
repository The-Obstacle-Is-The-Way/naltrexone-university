# DEBT-245: E2E Pyramid Drift and Data-Dependent Skip Governance

**Status:** Active  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure  
**GitHub Issue:** [#133](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/133)

## Problem

E2E is currently being used for two different concerns:

1. true end-to-end user journeys (correct scope)
2. implementation-detail audits (wrong layer for long-term reliability)

At the same time, multiple audit specs use data-dependent `test.skip(...)` paths that silently pass when required data is missing. This hides environment/data drift instead of failing fast with actionable signal.

## Evidence (Repository Audit, 2026-02-23)

### 1) Current E2E suite size and shape

- Spec files: `20` (`tests/e2e/*.spec.ts`)
- Playwright tests: `68` total (`66` passed, `2` skipped in latest full local run)

### 2) Skip usage inventory

- Credential-gating skips (`test.skip(!hasClerkCredentials, ...)`): `16` call-sites across `15` files
  (`bs-028-history-ux-audit.spec.ts` has two `test.describe` blocks, each with its own credential gate.)
  Context: auth-required specs only; acceptable for local/fork ergonomics when CI has explicit secret validation.

- Non-credential skips (`test.skip(...)` with runtime data/content checks): `20` occurrences across `6` specs:
  - `tests/e2e/bug-151-affordance-audit.spec.ts` (`5`)
  - `tests/e2e/bs-028-history-ux-audit.spec.ts` (`8`)
  - `tests/e2e/session-review-navigation.spec.ts` (`4`)
  - `tests/e2e/review-mode-audit.spec.ts` (`1`)
  - `tests/e2e/bs-019-action-bar-audit.spec.ts` (`1`)
  - `tests/e2e/brainstorming-audit.spec.ts` (`1`)

Representative skip reasons:
- `No session rows to audit`
- `No attempted questions in history — cannot verify`
- `No session with 2+ questions found — cannot test prev/next boundary`
- `Question has no choice explanations — cannot verify label sync`

### 3) Pyramid-layer drift (implementation-detail assertions in E2E)

Several specs assert CSS utility classes, computed style internals, and DOM structure details that belong in unit/browser tests:

- `tests/e2e/bug-151-affordance-audit.spec.ts`
  - class assertions like `hover:bg-muted`, `focus-visible:ring-*`
- `tests/e2e/bs-020-card-contrast-audit.spec.ts`
  - class token assertions and computed-style hover delta checks
- `tests/e2e/bs-028-history-ux-audit.spec.ts`
  - style/token/DOM-structure checks mixed with user-flow checks

### 4) Selector fragility

Some specs are tightly coupled to exact labels and microcopy:
- examples include exact text selectors for `"Next →"`, `"← Previous"`, and specific CTA wording.

These tests are valid as UI contract tests, but brittle when maintained at full-stack E2E layer.

## Full Spec Inventory

| Spec | Primary Scope | Credential Gate | Non-Credential Skip Count | Risk |
|---|---|---:|---:|---|
| `tests/e2e/smoke.spec.ts` | Journey | 0 | 0 | Low |
| `tests/e2e/pricing-unauthenticated.spec.ts` | Journey | 0 | 0 | Low |
| `tests/e2e/practice.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/subscribe.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/subscribe-and-practice.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/bookmarks.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/history.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/session-continuation.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/core-app-pages.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/cross-page-navigation.spec.ts` | Journey | 1 | 0 | Low |
| `tests/e2e/review-mode-audit.spec.ts` | Mixed (journey + contract) | 1 | 1 | Medium |
| `tests/e2e/session-review-navigation.spec.ts` | Mixed (journey + contract) | 1 | 4 | High |
| `tests/e2e/bug-151-affordance-audit.spec.ts` | Implementation audit | 1 | 5 | High |
| `tests/e2e/bs-028-history-ux-audit.spec.ts` | Implementation audit | 2 | 8 | High |
| `tests/e2e/bs-019-action-bar-audit.spec.ts` | Implementation audit | 1 | 1 | High |
| `tests/e2e/bs-020-card-contrast-audit.spec.ts` | Implementation audit | 1 | 0 | Medium |
| `tests/e2e/brainstorming-audit.spec.ts` | Implementation audit | 1 | 1 | Medium |
| `tests/e2e/marketing-contrast.spec.ts` | Visual contract audit | 0 | 0 | Medium |
| `tests/e2e/dark-mode.spec.ts` | Theme contract audit | 0 | 0 | Medium |
| `tests/e2e/theme-preference.spec.ts` | Theme contract audit | 0 | 0 | Medium |

## Root Cause (First Principles)

1. **Scope drift:** E2E absorbed UX/audit assertions that should live in lower, faster layers.
2. **State coupling:** audit specs depend on mutable shared account history instead of deterministic setup.
3. **Skip governance gap:** runtime data shortages are treated as skip-worthy rather than test setup failures.

## Definitive Resolution (No Optionality)

### 1) Enforce deterministic preconditions for every authenticated E2E spec

- Extend `tests/e2e/global.setup.ts` + seeded helpers to guarantee required baseline state.
- If a spec-specific precondition cannot be prepared, fail setup with explicit error (do not skip inside test body).

### 2) Remove non-credential `test.skip(...)` from E2E specs

- Allowed skip in E2E: credential gating only (`!hasClerkCredentials`) for local/fork ergonomics.
- Disallowed skip in E2E: content/data availability checks inside test bodies.

### 3) Rebalance to the testing pyramid

- Keep E2E for true user outcomes and critical cross-system flows.
- Migrate style/token/DOM-shape assertions to:
  - unit (`renderToStaticMarkup`) for class/token contract checks
  - browser-mode (`vitest-browser-react`) for interactive isolated UI behavior

### 4) Harden selectors in retained E2E specs

- Prefer role-based selectors with resilient names (regex where appropriate).
- Minimize exact-microcopy coupling unless microcopy is the explicit contract under test.

### 5) Add CI guardrail for skip governance

- Add a lightweight validation step that fails CI if a non-credential `test.skip(...)` is introduced in `tests/e2e/*.spec.ts`.

## Concrete Refactor Plan

1. **Stabilize state preconditions**
   - Files: `tests/e2e/global.setup.ts`, `tests/e2e/helpers/reset-e2e-user-state.ts`
   - Outcome: all auth E2E tests run against deterministic baseline data.

2. **Delete body-level skips**
   - Files:
     - `tests/e2e/session-review-navigation.spec.ts`
     - `tests/e2e/bug-151-affordance-audit.spec.ts`
     - `tests/e2e/bs-028-history-ux-audit.spec.ts`
     - `tests/e2e/bs-019-action-bar-audit.spec.ts`
     - `tests/e2e/brainstorming-audit.spec.ts`
     - `tests/e2e/review-mode-audit.spec.ts`
   - Outcome: missing baseline data fails loudly instead of skipping.

3. **Extract implementation audits down the pyramid**
   - Source specs:
     - `tests/e2e/bug-151-affordance-audit.spec.ts`
     - `tests/e2e/bs-020-card-contrast-audit.spec.ts`
     - style-heavy portions of `tests/e2e/bs-028-history-ux-audit.spec.ts`
   - Destination:
     - colocated unit tests (`*.test.tsx`, `renderToStaticMarkup`)
     - browser-mode specs (`*.browser.spec.tsx`) for interactive contracts
   - Outcome: smaller E2E surface, lower flake rate, faster signal.

4. **Selector hardening pass**
   - Start with:
     - `tests/e2e/session-review-navigation.spec.ts`
     - `tests/e2e/bs-019-action-bar-audit.spec.ts`
     - `tests/e2e/review-mode-audit.spec.ts`
   - Outcome: reduced breakage from harmless copy changes.

5. **Add skip-policy check**
   - Add CI script to enforce:
     - deny `test.skip(` in E2E unless it matches credential gate pattern.
   - Outcome: regression-proof governance.

## Verification Plan

1. Run full E2E after deterministic setup changes.  
   Expected: `0` non-credential skips; failures indicate real breakage/precondition mismatch.

2. Intentionally remove a seeded prerequisite (for one target flow).  
   Expected: explicit setup/test failure, not skip.

3. Run migrated unit/browser tests for former class/token audits.  
   Expected: same contract coverage with faster and less flaky execution.

4. Introduce a temporary non-credential `test.skip(true, ...)` in an E2E spec on a branch.  
   Expected: CI guardrail fails with clear policy message.

## Priority

**P1** — Do this after current stabilization work (DEBT-243/244), before major new UI feature expansion.  
Without this, E2E remains noisy, under-signaled, and expensive to maintain.
