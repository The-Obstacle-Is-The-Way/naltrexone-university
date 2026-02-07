# DEBT-126: console.warn in Repository Bypasses Structured Logger

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

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

Either inject `Logger` into the repository constructor, silently handle, or throw `ApplicationError` if orphans indicate data corruption.

## Verification

- [ ] No `console.warn` in repository code
- [ ] Existing tests pass

## Related

- `src/application/ports/logger.ts` — Logger port interface
