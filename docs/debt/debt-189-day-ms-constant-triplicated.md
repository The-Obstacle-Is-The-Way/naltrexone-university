# DEBT-189: DAY_MS Constant Defined in Three Separate Files

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

The constant `DAY_MS = 86_400_000` is independently defined in three files:

| File | Line |
|------|------|
| `src/domain/services/statistics.ts` | 1 |
| `src/application/use-cases/get-user-stats.ts` | 10 |
| `src/adapters/gateways/drizzle-rate-limiter.ts` | 12 |

## Impact

- Minor DRY violation — if the value needed to change (it won't, but principle applies)
- Clutters grep results with redundant definitions
- Slightly violates dependency direction: application layer redefines a domain constant

## Resolution

Export `DAY_MS` from `src/domain/services/statistics.ts` and import it in the two consumer files.

Note: `drizzle-rate-limiter.ts` is in the adapters layer and can import from domain, so this is architecturally valid.

## Verification

- [ ] Single definition of `DAY_MS` in `src/domain/services/statistics.ts`
- [ ] Both consumers import from domain
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes
