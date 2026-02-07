# DEBT-139: Production Files Exceed 300-Line Guardrail

**Status:** Invalidated (Scope Corrected)
**Priority:** P2
**Date:** 2026-02-07
**Invalidated:** 2026-02-07

---

## Description

The repository has a practical guardrail that production modules should stay under 300 lines for readability and maintainability. A static file-size scan found several production files over this threshold.

This debt item was invalidated as written because it framed a global file-length rule that is not defined in SSOT/ADR docs. The remaining valid line-cap concern is SPEC-scoped (SPEC-020 Phase 1 for practice-engine files) and is tracked separately in active DEBT-142.

Validated from first principles (`wc -l` on tracked source files):

- `src/adapters/repositories/drizzle-practice-session-repository.ts` — 447 lines
- `app/(marketing)/checkout/success/page.tsx` — 412 lines
- `app/(app)/app/practice/practice-page-logic.ts` — 406 lines
- `src/adapters/repositories/drizzle-attempt-repository.ts` — 337 lines

## Impact

- Higher change risk and review cost in critical user/billing/practice paths
- Lower cohesion and weaker test focus due to mixed responsibilities
- Refactoring friction when adding features from upcoming specs

## Resolution

1. Split each oversized file by responsibility:
   - move parsing/formatting helpers into dedicated modules
   - extract query-shaping/mapping helpers from repositories
   - keep page/server entrypoints thin and orchestrational
2. Add targeted tests around each extracted boundary before moving logic
3. Add a lightweight size check in CI for non-test production files (warn/fail over threshold)

## Verification

- [ ] All production files are <= 300 lines (excluding tests)
- [ ] Extracted modules retain behavior parity via existing and new tests
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test --run` passes

## Related

- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `app/(marketing)/checkout/success/page.tsx`
- `app/(app)/app/practice/practice-page-logic.ts`
- `src/adapters/repositories/drizzle-attempt-repository.ts`
