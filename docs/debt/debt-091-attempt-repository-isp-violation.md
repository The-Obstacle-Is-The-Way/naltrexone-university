# DEBT-091: AttemptRepository is “Fat” (Interface Segregation Pressure)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-04

---

## Description

`AttemptRepository` contains many methods that serve different read/write use cases (insert, pagination, counts, streak queries, missed questions queries, etc.). Most consumers use only a small subset of these methods, but are forced (via the interface) to depend on—and implement—everything.

Evidence:

- `src/application/ports/repositories.ts:64-111` defines `AttemptRepository` with many query methods.
- Fakes must implement all methods, even when a test only needs `insert()` or `findMostRecentAnsweredAtByQuestionIds()`.

This isn’t “wrong” TypeScript, but it creates ongoing pressure against the Interface Segregation Principle (ISP) and inflates the surface area of both implementations and test doubles.

## Impact

- **Higher coupling:** Use cases depend on methods they don’t use.
- **Fake complexity:** Fakes become large and easier to get subtly wrong.
- **Slower iteration:** Adding a method for one use case forces edits across many fakes/tests.

## Resolution

### Option A: Split repository ports by capability (Recommended)

Define narrower ports and inject only what each use case needs, for example:

- `AttemptWriter` → `insert(...)`
- `AttemptSessionReader` → `findBySessionId(...)`
- `AttemptStatsReader` → `count*`, `listRecentByUserId`, `listAnsweredAtByUserIdSince`
- `AttemptReviewReader` → `listMissedQuestionsByUserId(...)`
- `AttemptHistoryReader` → `findByUserId(page)`

Then update use cases and controllers to depend on the narrowest required interface(s). A single Drizzle repository can implement all of them.

### Option B: Keep interface, but isolate fake complexity

Keep `AttemptRepository` as-is but provide focused helper constructors in fakes to simplify common scenarios. This reduces pain but does not address coupling.

## Verification

- Use cases compile with narrower injected ports.
- Fakes/tests only implement what they use.
- `pnpm typecheck && pnpm test --run` pass.

## Related

- `src/application/ports/repositories.ts`
- `src/application/test-helpers/fakes.ts`

