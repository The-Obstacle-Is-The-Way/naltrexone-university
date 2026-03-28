# DEBT-342: Idempotency Backward-Compat Guard Cleanup

**Priority:** P4
**Created:** 2026-03-28
**Status:** Open
**Scope:** `src/adapters/shared/with-idempotency.ts`

---

## Problem

`withIdempotency()` (line 145–147) contains a backward-compatibility guard:

```typescript
// Backward compatibility: legacy rows may predate completedAt and still
// have a non-null cached payload.
if (existing.completedAt !== null || existing.resultJson !== null) {
```

The check uses `||` instead of just checking `completedAt !== null` because the `completedAt` column was added after initial deployment. Rows created before that migration might have `resultJson` populated but `completedAt` still null.

This is a greenfield project with no users. The local test database has zero such legacy rows. The production and preview databases have no users generating idempotency keys. There are no legacy rows anywhere.

---

## What Changes

Replace the OR guard with a simple `completedAt` check:

```typescript
if (existing.completedAt !== null) {
```

Remove the backward-compatibility comment.

---

## Risk Assessment

**Risk: Negligible.** Zero legacy rows exist. No users have ever generated idempotency keys in production. The `completedAt` column has been present since the first migration that matters.

---

## Estimated Effort

Trivial. One line change, one comment removal. Existing test suite covers the `completedAt` path.
