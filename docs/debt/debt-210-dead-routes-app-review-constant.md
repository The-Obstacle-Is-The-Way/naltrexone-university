# DEBT-210: Dead `ROUTES.APP_REVIEW` Constant in Route Definitions

**Status:** Open
**Priority:** P4
**Date:** 2026-02-11
**GitHub Issue:** #90

---

## Description

`lib/routes.ts:12` defines `APP_REVIEW: '/app/review'` but the constant has zero consumers anywhere in the codebase. SPEC-021 (History Page Restructure) replaced all code references with `ROUTES.APP_HISTORY` during implementation. The constant is now dead code.

### Current State

- **Definition:** `lib/routes.ts:12` — `APP_REVIEW: '/app/review'`
- **Consumers in `app/`:** 0
- **Consumers in `lib/`:** 0 (only the definition itself)
- **Consumers in `src/`:** 0

### Why It Still Exists

The legacy `/app/review` URL redirect is handled in `next.config.ts:39` as a hardcoded string (not referencing the constant):

```typescript
{
  source: '/app/review',
  destination: '/app/history?tab=questions&result=incorrect',
  permanent: true,
}
```

The redirect uses a string literal, not `ROUTES.APP_REVIEW`, so the constant is truly orphaned.

### Related But Not Dead

- `QuestionOrigin = 'review'` in `lib/routes.ts:24` — This is still used for backward compat with `?from=review` query params in question page links. It refers to the **origin context** (where the user came from), not the route itself. This is NOT dead and should be kept.

## Impact

- **Trivial** — One unused constant. No runtime impact.
- **Minor confusion** — Developers may think the route still exists when reading `ROUTES`.

## Resolution

1. Delete `APP_REVIEW: '/app/review'` from `lib/routes.ts`
2. Verify no TypeScript errors (there shouldn't be any since nothing references it)
3. Run `pnpm typecheck && pnpm test --run`

## Verification

- `pnpm typecheck` passes after removal
- Grep for `APP_REVIEW` returns zero results outside docs

## Related

- SPEC-021 (History Page Restructure, archived) — replaced all `APP_REVIEW` references
- `next.config.ts:39` — hardcoded redirect (unaffected by constant removal)
- `lib/routes.ts:24` — `QuestionOrigin = 'review'` is still active (different concept)
