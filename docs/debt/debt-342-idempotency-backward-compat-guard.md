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

Repository verification on 2026-03-28 found:

- `idempotency_keys` was created in `db/migrations/0003_dashing_landau.sql` without `completed_at`.
- `completed_at` was added later in `db/migrations/0012_whole_baron_strucker.sql`, which also backfilled rows where `result_json` or `error_code` was already populated.
- `db/schema.ts` still models both `resultJson` and `completedAt` as nullable columns.
- No seeds, integration fixtures, or repository fakes create persisted idempotency rows where `completedAt` is null and `resultJson` is non-null.
- The current unit suite does include one synthetic backward-compat test in `src/adapters/shared/with-idempotency.test.ts` that overrides `find()` to return `completedAt: null` with a cached payload, so removing the fallback requires updating that test coverage.

Operational claims about production or preview database contents are intentionally omitted here because they are not verifiable from repository state alone.

---

## What Changes

Replace the OR guard with a simple `completedAt` check:

```typescript
if (existing.completedAt !== null) {
```

Remove the backward-compatibility comment.

---

## Risk Assessment

**Risk: Low.** Repository-local evidence shows no persisted legacy rows in seeds, fixtures, or fakes, but the direct `withIdempotency` unit suite currently exercises the fallback via a synthetic test double. The change should stay local to replay semantics and test expectations.

---

## Estimated Effort

Small. One line change, one comment removal, one targeted test update, and the standard verification gate.
