# DEBT-178: Duplicated LoadState Types Across Page Logic Modules

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

There are multiple `LoadState` type declarations with overlapping semantics:

- `app/(app)/app/practice/practice-page-logic.ts` (`idle | loading | ready | error`)
- `app/(app)/app/questions/[slug]/question-page-logic.ts` (`loading | ready | error`)

Both represent the same state-machine concept (async page load + error), but with independently defined union types. This duplicates semantics and increases drift risk for shared UI patterns (error rendering, retry behavior, disabled/loading logic).

## Impact

- Inconsistent async-state semantics across page logic modules
- Higher maintenance when evolving shared loading/error behavior
- Harder reuse of helper utilities across practice/question flows

## Resolution

1. Extract a shared async load-state type module (e.g., `app/(app)/app/shared/load-state.ts` or adapter-shared equivalent).
2. Reuse one canonical type across question/practice logic modules.
3. Keep page-specific behavior differences in helper functions, not type shape divergence.

## Verification

- [x] One canonical shared load-state module introduced (`app/(app)/app/shared/load-state.ts`)
- [x] Practice and question page logic modules now consume shared load-state types
- [x] Existing logic/tests continue to pass without behavior regression
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/questions/[slug]/question-page-logic.ts`
