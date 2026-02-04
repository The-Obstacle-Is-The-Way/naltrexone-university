# DEBT-091: AttemptRepository is “Fat” (Interface Segregation Pressure)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

`AttemptRepository` exposed many unrelated read/write capabilities. This increased coupling (use cases depended on methods they didn’t use) and inflated the surface area required by fakes/implementations.

## Resolution

Split `AttemptRepository` into narrower ports in `src/application/ports/repositories.ts`:

- `AttemptWriter`
- `AttemptHistoryReader`
- `AttemptSessionReader`
- `AttemptStatsReader`
- `AttemptMissedQuestionsReader`
- `AttemptMostRecentAnsweredAtReader`

`AttemptRepository` now extends these smaller interfaces, and application use cases depend on the narrowest required port(s).

## Verification

- `pnpm typecheck`
- `pnpm test --run`

