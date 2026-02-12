# DEBT-212: Duplicate `sleep()` Utility in Adapter Shared Modules

**Status:** Open
**Priority:** P4
**Date:** 2026-02-11
**GitHub Issue:** #91

---

## Description

Two identical `sleep()` / `sleepDefault()` implementations exist in the adapter shared layer:

### Location 1: `src/adapters/shared/retry.ts:18`

```typescript
function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Location 2: `src/adapters/shared/with-idempotency.ts:11`

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Both are private (`function`, not `export function`), used only within their respective modules. The implementations are byte-for-byte identical (modulo the name).

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

Then import from both `retry.ts` and `with-idempotency.ts`.

### Alternative: Accept as-is

Given the functions are 3 lines, private, and stable, this can reasonably be accepted as intentional encapsulation. The cost of abstraction may exceed the cost of duplication for such a trivial utility.

## Verification

- `pnpm typecheck` passes
- `pnpm test --run` — all tests pass (retry and idempotency tests exercise both paths)

## Related

- `src/adapters/shared/retry.ts` — Exponential backoff with jitter for Stripe SDK calls
- `src/adapters/shared/with-idempotency.ts` — Idempotency key polling with sleep between retries
