# DEBT-126: console.warn in Repository Bypasses Structured Logger

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-07

---

## Description

`DrizzlePracticeSessionRepository.normalizeParams()` uses `console.warn()` to log orphaned questionStates. This bypasses the structured `Logger` port and violates Clean Architecture — infrastructure code shouldn't use global console directly when a logger port exists.

## Impact

- Orphan warnings don't appear in structured log aggregation (Vercel, Sentry)
- Inconsistent with all other adapter code that uses the injected `Logger`
- In tests, these warnings pollute test output

## Affected File

`src/adapters/repositories/drizzle-practice-session-repository.ts:100-108`

## Resolution

Removed direct `console.warn` usage from `DrizzlePracticeSessionRepository.normalizeParams()`.

Current behavior:
- orphaned `questionStates` are silently filtered out
- valid in-session question states are preserved
- no global console logging in repository code

## Verification

- [x] No `console.warn` in repository code
- [x] Repository tests updated and passing (`drizzle-practice-session-repository.test.ts`)

## Related

- `src/application/ports/logger.ts` — Logger port interface
