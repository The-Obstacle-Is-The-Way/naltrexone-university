# DEBT-247: Test Helper Structure Cleanup

**Status:** Resolved  
**Priority:** P4  
**Date:** 2026-02-24  
**Resolved:** 2026-02-24  
**Owner:** Test Infrastructure

---

## Resolution Verification (2026-02-24)

- Deleted orphan files:
  - `tests/e2e/helpers/color-utils.ts`
  - `tests/e2e/helpers/color-utils.test.ts`
- Moved cross-boundary test:
  - `tests/shared/question-helper.test.ts` → `tests/e2e/helpers/question.test.ts`
- Added helper contract docs:
  - `tests/shared/README.md`
  - `tests/test-helpers/README.md`
- Replaced local deferred helpers with canonical import:
  - `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
  - `src/adapters/shared/concurrency.test.ts`
- Validation:
  - `pnpm test --run` passed

## Description

The current helper structure is mostly healthy and layered correctly:

- `tests/e2e/helpers/` for Playwright flow helpers
- `tests/shared/` for cross-suite infrastructure utilities
- `tests/test-helpers/` for reusable async/result primitives

The audit found four concrete cleanup items that should be addressed to keep the structure clean and unambiguous.

## Verified Current State

### Healthy boundaries

- E2E specs import only from `tests/e2e/helpers/*` (plus app/runtime modules).
- `tests/shared/*` utilities are consumed by non-E2E unit/integration tests.
- `tests/test-helpers/*` utilities are consumed broadly by unit/browser test files.

### Actual structural debt

1. **Orphan helper module**
- File: `tests/e2e/helpers/color-utils.ts`
- `rg` usage shows no runtime consumer beyond its own test file.

2. **Cross-boundary misplaced test**
- File: `tests/shared/question-helper.test.ts`
- Imports from `../e2e/helpers/question`, which violates shared-layer direction.

3. **Directory intent not documented**
- `tests/shared/` and `tests/test-helpers/` are both valid and non-redundant, but intent is implicit.
- This causes repeated “which folder should this helper go in?” ambiguity.

4. **Local duplicated deferred helper implementations**
- Duplicate local `createDeferred` implementations exist in:
  - `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
  - `src/adapters/shared/concurrency.test.ts`
- Canonical helper already exists at `tests/test-helpers/create-deferred.ts`.

---

## Required Resolution (Definitive)

1. **Remove orphan color helper files**
- Delete:
  - `tests/e2e/helpers/color-utils.ts`
  - `tests/e2e/helpers/color-utils.test.ts`
- Keep `parseRgba` logic local in `tests/e2e/marketing-contrast.spec.ts` (it is the active implementation).

2. **Colocate misplaced question helper tests**
- Move:
  - `tests/shared/question-helper.test.ts`
  - to `tests/e2e/helpers/question.test.ts`
- Update imports to local module path.

3. **Document helper folder contracts in-repo**
- Add `README.md` files:
  - `tests/shared/README.md`
  - `tests/test-helpers/README.md`
- Required contract text:
  - `tests/shared`: env/fixture/process utilities used across suites.
  - `tests/test-helpers`: generic async/result primitives for test orchestration.
  - no imports from `tests/e2e/helpers` inside `tests/shared`.

4. **Deduplicate local deferred helper implementations**
- Replace local `createDeferred` functions with imports from:
  - `@/tests/test-helpers/create-deferred`
- Target files:
  - `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
  - `src/adapters/shared/concurrency.test.ts`

---

## Verification

- [x] `tests/e2e/helpers/color-utils.ts` and `tests/e2e/helpers/color-utils.test.ts` are deleted.
- [x] `tests/shared/question-helper.test.ts` no longer exists; replacement test lives at `tests/e2e/helpers/question.test.ts`.
- [x] `tests/shared/README.md` and `tests/test-helpers/README.md` are present and accurate.
- [x] No `createDeferred` local function remains in the two target files.
- [x] `rg "from.*e2e/helpers" tests/shared` returns no results.
- [x] `pnpm test --run` passes.

## Related

- [DEBT-246](../../debt/debt-246-e2e-coverage-gaps-visual-testing-strategy.md)
- `.claude/rules/testing.md`
