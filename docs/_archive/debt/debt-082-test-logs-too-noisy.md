# DEBT-082: Unit Tests Emit Noisy Error Logs

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-03

---

## Description

Unit tests that intentionally exercise error paths (e.g. controller error handling)
were emitting structured error logs via the global Pino logger.

This made `pnpm test --run` output noisy and reduced the signal-to-noise ratio in CI.

## Impact

- CI logs were cluttered with expected/intentional error logs.
- Harder to notice real regressions when scanning test output.

## Resolution

- Default the global logger to `silent` when `NODE_ENV=test` (unless `LOG_LEVEL` is explicitly set).
- Treat empty/whitespace `LOG_LEVEL` as unset to avoid misconfiguration errors.
- Add unit tests covering the logger level selection.

## Verification

- [x] `pnpm test --run`
- [x] `pnpm typecheck`

## Related

- `lib/logger.ts`
- `lib/logger.test.ts`

