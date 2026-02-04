# DEBT-095: console.error Usage in Production Code (Bypasses Structured Logger)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-04

---

## Description

Some production code uses `console.error(...)` directly rather than the structured logger (`lib/logger.ts`). This can reduce consistency of logs and makes redaction policies easier to bypass.

Evidence:

- `lib/env.ts:79-85` logs validation failures with `console.error(...)` before throwing.
- `lib/env.ts:109-112` logs missing Clerk keys with `console.error(...)` before throwing.
- `lib/env.ts:144-147` logs Clerk key consistency validation errors with `console.error(...)` before throwing.
- `app/api/health/route.ts:15-17` logs DB health-check failure via `console.error(...)`.

## Impact

- **Observability drift:** logs differ in shape/metadata compared to pino JSON logs.
- **Redaction policy risk:** `lib/logger.ts` defines explicit redaction paths; `console.error` does not.
- **Harder ingestion:** downstream log processors (Vercel/Datadog) may treat console logs differently than structured logs.

## Resolution

### Option A: Replace with structured logger where safe (Recommended for non-bootstrap code)

- For request/route code like `app/api/health/route.ts`, use the structured logger (`lib/logger.ts`) or DI logger.

### Option B: Keep `console.error` in bootstrap code but document why (Recommended for env validation)

For `lib/env.ts`, using `console.error` may be intentional because env validation happens very early at import-time, before DI/container initialization. If we keep it:

- Add a brief comment stating why structured logging is not used here.
- Ensure logged data never includes secret values (only field names / validation errors).

## Verification

- `rg "console\\.error" lib app` is limited to:
  - error boundaries (acceptable)
  - explicitly documented bootstrap/edge cases
- `pnpm test --run` remains green.

## Related

- `lib/logger.ts` (pino logger + redaction config)
- `lib/env.ts`
- `app/api/health/route.ts`

