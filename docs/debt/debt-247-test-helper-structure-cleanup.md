# DEBT-247: Test Helper Structure Cleanup

**Status:** Open
**Priority:** P4
**Date:** 2026-02-24
**Owner:** Test Infrastructure

---

## Description

An audit of the `tests/` directory found the test helper structure is **fundamentally sound** — layer boundaries are clean and E2E helpers are properly colocated. However, three minor structural issues exist:

1. Dead code in `tests/e2e/helpers/`
2. A misplaced test file that crosses layer boundaries
3. Confusing naming between two helper directories

## Current Structure

```
tests/
├── e2e/
│   ├── helpers/            # 12 files — Playwright-specific helpers (clerk-auth, session, question, etc.)
│   │   ├── *.test.ts       # Unit tests for pure-logic E2E helpers (run under pnpm test, not pnpm test:e2e)
│   │   └── *.ts            # Helpers imported by *.spec.ts files
│   └── *.spec.ts           # 15 E2E spec files (Playwright)
├── fixtures/               # JSON payloads for Clerk/Stripe webhook tests
│   ├── clerk/              # user.deleted.json, user.updated.json
│   └── stripe/             # subscription event JSONs
├── integration/            # Integration tests (DB, Stripe, controllers)
│   └── setup.ts            # Integration env setup
├── shared/                 # Cross-layer infrastructure utilities
│   ├── load-dotenv-file.ts # dotenv wrapper (used by integration setup)
│   ├── load-json-fixture.ts# JSON fixture loader (used by adapter tests)
│   ├── process-env.ts      # env snapshot/restore (used by 9 component/unit tests)
│   └── question-helper.test.ts  # ⚠ MISPLACED — tests E2E helper functions
└── test-helpers/           # Async/data test primitives
    ├── create-deferred.ts  # Deferred promise utility (used by 14 unit/browser tests)
    └── ok.ts               # Result factory (used by 14 unit/browser tests)
```

Additionally, domain-layer helpers exist at:
- `src/domain/test-helpers/` — entity factories (`createQuestion()`, `createChoice()`, etc.)
- `src/application/test-helpers/fakes/` — fake repositories (`FakeQuestionRepository`, etc.)

## Impact

- Dead code adds confusion for new contributors
- Misplaced test creates a cross-layer import (shared → e2e)
- Naming ambiguity between `test-helpers/` and `shared/` makes it unclear where new utilities should go

---

## Issue 1: Dead Code — `tests/e2e/helpers/color-utils.ts`

`color-utils.ts` exports `getCssVariables`, `getComputedBgColor`, `parseRgba`, `approximateLightness`, and `requireLightness`. **None of these are imported by any E2E spec file.** The only consumer is its own test file `color-utils.test.ts`.

Meanwhile, `marketing-contrast.spec.ts` contains an inline `parseRgba` function that duplicates and extends the one in `color-utils.ts` (handles hex and transparent in addition to rgba).

**Fix:** Delete `color-utils.ts` and `color-utils.test.ts`. The inline `parseRgba` in `marketing-contrast.spec.ts` is more complete and self-contained.

## Issue 2: Misplaced Test — `tests/shared/question-helper.test.ts`

This test file imports from `tests/e2e/helpers/question.ts`:

```typescript
import {
  rethrowIfQuestionMissingCheckError,
  SeededQuestionMissingError,
} from '../e2e/helpers/question';
```

This is a **cross-boundary violation** — `tests/shared/` should not import from `tests/e2e/helpers/`. It works because the functions under test are pure error-handling logic that doesn't use Playwright APIs, but the import path creates a misleading dependency.

**Fix:** Move `question-helper.test.ts` to `tests/e2e/helpers/question.test.ts` to colocate it with its source module. This is consistent with how `color-utils.test.ts`, `credential-health-check.test.ts`, and `reset-e2e-user-state.test.ts` are already structured.

## Issue 3: Confusing Naming — `tests/test-helpers/` vs `tests/shared/`

Both directories sit under `tests/` and contain cross-cutting test utilities. Their names do not communicate their distinct responsibilities:

| Directory | Actual Purpose | Files |
|-----------|---------------|-------|
| `tests/test-helpers/` | Async/data primitives for unit + browser tests | `create-deferred.ts`, `ok.ts` |
| `tests/shared/` | Infrastructure utilities (env loading, fixture loading) | `load-dotenv-file.ts`, `load-json-fixture.ts`, `process-env.ts` |

They are **not redundant** (zero overlap in consumers or purpose), but a new contributor would not know which directory to use for a new utility.

**Fix (choose one):**
- **Option A (minimal):** Add a one-line comment to each directory's purpose in this debt doc. No code change needed — the directories are small enough (2 and 3 files) that the cognitive load is negligible.
- **Option B (merge):** Move `create-deferred.ts` and `ok.ts` into `tests/shared/` under a `primitives/` or `factories/` subdirectory. Update 26 import paths.

**Recommendation:** Option A. The directories are too small to justify a 26-file import path migration.

---

## Boundary Verification (Clean)

The audit confirmed these boundaries are **not violated**:

- E2E helpers (`tests/e2e/helpers/`) are NOT imported by unit/integration tests (except Issue 2 above)
- Domain test helpers (`src/domain/test-helpers/`) are NOT imported by E2E tests
- Application fakes (`src/application/test-helpers/fakes/`) are NOT imported by E2E tests
- E2E helper unit tests (`*.test.ts` in `tests/e2e/helpers/`) correctly run under `pnpm test` (Vitest), not `pnpm test:e2e` (Playwright)

---

## Resolution

1. Delete `tests/e2e/helpers/color-utils.ts` and `tests/e2e/helpers/color-utils.test.ts`
2. Move `tests/shared/question-helper.test.ts` to `tests/e2e/helpers/question.test.ts`
3. No structural change needed for `test-helpers/` vs `shared/` naming (Option A)

## Verification

- [ ] `color-utils.ts` and `color-utils.test.ts` deleted
- [ ] `question-helper.test.ts` moved and import path updated
- [ ] `pnpm test --run` passes
- [ ] No cross-boundary imports remain: `rg "from.*e2e/helpers" tests/shared/` returns nothing

## Related

- [DEBT-246](debt-246-e2e-coverage-gaps-visual-testing-strategy.md) — coverage gaps from deleted audit specs
- `.claude/rules/testing.md` — test location conventions
