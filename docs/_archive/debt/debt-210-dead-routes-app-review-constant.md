# DEBT-210: Dead `ROUTES.APP_REVIEW` Constant in Route Definitions

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-11
**Resolved:** 2026-02-14
**GitHub Issue:** #90

---

## Description

This debt is **subsumed by DEBT-215**. It originally tracked a dead `ROUTES.APP_REVIEW` constant (and the surrounding “review” legacy concepts) that had no production consumers.

## Resolution

Resolved by DEBT-215 (2026-02-14):

- Deleted `ROUTES.APP_REVIEW` from `lib/routes.ts`
- Removed the `/app/review` redirect from `next.config.ts`
- Removed `QuestionOrigin = 'review'` support (`from=review` parsing + UI branch)

## Verification

- `pnpm typecheck` passes
- Grep for `APP_REVIEW` returns zero results outside docs

## Related

- DEBT-215 — Backwards Compatibility Shims Cleanup
