# DEBT-142: SPEC-020 Line-Cap Regression in Practice Page Logic

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

SPEC-020 Phase 1 defined a decomposition gate of `<= 300` lines per practice-related file. Current code exceeds that cap in the practice orchestrator logic module:

- `app/(app)/app/practice/practice-page-logic.ts` = 405 lines (`wc -l`)

This is not a global "all production files" rule. It is a scoped SPEC-020 requirement for the practice engine refactor.

## Impact

- SPEC/documentation drift: SPEC-020 is marked implemented while one phase gate is currently violated
- Increased maintenance risk in the exact module that Phase 1 aimed to simplify
- Higher review and change cost for upcoming practice UX iterations

## Resolution

1. Split `practice-page-logic.ts` by responsibility (state-machine orchestration vs. mapping/helpers)
2. Keep each extracted production module at `<= 300` lines
3. Preserve behavior with existing tests and add focused tests for any extracted boundaries
4. Re-validate SPEC-020 phase gate language once refactor lands

## Verification

- [ ] `app/(app)/app/practice/practice-page-logic.ts` is refactored below 300 lines or split
- [ ] All extracted production files stay at `<= 300` lines
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test --run` passes

## Related

- `docs/specs/spec-020-practice-engine-completion.md` (FR-1 / Phase 1 gate)
- `docs/_archive/debt/debt-115-practice-page-god-component.md`
- `app/(app)/app/practice/practice-page-logic.ts`
