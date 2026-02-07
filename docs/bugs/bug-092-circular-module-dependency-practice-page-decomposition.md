# BUG-092: Circular Module Dependency in Practice Page Decomposition

**Status:** Open
**Priority:** P4
**Date:** 2026-02-07

---

## Description

The DEBT-142 decomposition of `practice-page-logic.ts` introduced a circular module dependency. `practice-page-logic.ts` re-exports from `./practice-page-session-start`, and `practice-page-session-start.ts` imports `PracticeFilters` back from `./practice-page-logic`. This creates a cycle.

## Root Cause

`app/(app)/app/practice/practice-page-session-start.ts:7`:

```typescript
import type { PracticeFilters } from './practice-page-logic';
```

`app/(app)/app/practice/practice-page-logic.ts` re-exports:

```typescript
export { startSession, ... } from './practice-page-session-start';
```

The cycle works today because the `PracticeFilters` import is type-only (erased at compile time by TypeScript). However:

- Any future value import from `practice-page-logic` in this file would break at runtime
- Some bundler configurations warn or fail on circular imports
- It violates the principle of unidirectional dependency flow

## Impact

- No runtime breakage today (type-only import is erased)
- Fragile — adding a value import would break silently
- Inconsistent with Clean Architecture's unidirectional dependency rule

## Proposed Fix

Extract `PracticeFilters` into a shared types file (e.g., `practice-page-types.ts`) that both modules import from, breaking the cycle:

```
practice-page-types.ts  ← PracticeFilters lives here
  ↑                ↑
  |                |
practice-page-logic.ts    practice-page-session-start.ts
```

Also update the import to use the `@/` alias per project convention.

## Verification

- [ ] No circular imports between practice-page-* modules
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test --run` passes

## Related

- DEBT-142 (practice page decomposition)
- CodeRabbit PR #68 review
- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/practice-page-session-start.ts`
