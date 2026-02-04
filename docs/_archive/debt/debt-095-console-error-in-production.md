# DEBT-095: console.error Usage in Production Code (Bypasses Structured Logger)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-04
**Resolved:** 2026-02-04

---

## Description

Some production code uses `console.error(...)` directly rather than the structured logger (`lib/logger.ts`). This can reduce consistency of logs and makes redaction policies easier to bypass.

Evidence:

- `lib/env.ts` logs validation failures with `console.error(...)` before throwing.
- `app/api/health/route.ts` logged DB health-check failure via `console.error(...)`.

## Impact

- **Observability drift:** logs differ in shape/metadata compared to pino JSON logs.
- **Redaction policy risk:** `lib/logger.ts` defines explicit redaction paths; `console.error` does not.
- **Harder ingestion:** downstream log processors (Vercel/Datadog) may treat console logs differently than structured logs.

## Resolution

### Replace with structured logger where safe (Non-bootstrap code)

- `app/api/health/route.ts` now logs failures via the structured logger (with an injected handler to keep it unit-testable).

### Keep `console.error` in bootstrap code but document why (Env validation)

For `lib/env.ts`, using `console.error` may be intentional because env validation happens very early at import-time, before DI/container initialization. If we keep it:

- Add a brief comment stating why structured logging is not used here.
- Ensure logged data never includes secret values (only field names / validation errors).

## Verification

- `rg "console\\.error" lib app` is limited to:
  - error boundaries (acceptable)
  - explicitly documented bootstrap/edge cases
  - client-only fallback logging (acceptable; browser-side)
- `pnpm test --run` remains green.

## Related

- `lib/logger.ts` (pino logger + redaction config)
- `lib/env.ts`
- `app/api/health/route.ts`
