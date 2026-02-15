# DEBT-212: Duplicate `sleep()` Utility in Adapter Shared Modules

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-11
**Resolved:** 2026-02-14
**GitHub Issue:** #91

---

## Description

Two identical `sleep()` implementations previously existed in the adapter shared layer (`retry.ts` and `with-idempotency.ts`). Both were private (`function`, not `export function`) and byte-for-byte identical.

## Impact

- **Trivial** — 3 lines of duplicated code, both private
- **No runtime impact** — both work correctly
- **Minor DRY violation** — if sleep behavior ever needs to change (e.g., adding cancellation support), two files need updating

## Resolution

Extract a shared utility:

```typescript
// src/adapters/shared/delay.ts
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Both `retry.ts` and `with-idempotency.ts` now import `delay()` instead of duplicating a local `sleep()` helper.

## Verification

- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm test --run` — all tests pass (retry and idempotency tests exercise both paths)

## Related

- `src/adapters/shared/delay.ts` — Shared promise-based delay helper
- `src/adapters/shared/retry.ts` — Shared retry helper for external calls (exponential backoff)
- `src/adapters/shared/with-idempotency.ts` — Idempotency key polling with delays between retries

## Resolution Notes (2026-02-14)

- Extracted `delay(ms)` into `src/adapters/shared/delay.ts` and replaced both internal `sleep()` implementations with an import.
