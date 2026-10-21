# BUG-342: A User-Repository Conflict Test Fails When Its Two Writes Share a Millisecond

**Status:** Verifying — every check is recorded, and the record closes; due 2026-10-22
**Priority:** P3
**Date:** 2026-10-13

---

## Summary

The integration test "keeps an outer transaction usable after classifying an email conflict" (`tests/integration/user-repository.integration.test.ts`) creates a user row, then writes another user's email to that row and expects a uniqueness conflict. Each write took its time from the wall clock, in milliseconds. `upsertByClerkId` replaces a stored email only when the write is strictly later than the row's `updated_at`, so a stale event cannot overwrite a newer one. When both writes read the same millisecond, the email was left alone, nothing conflicted, and the test failed. The product behaviour is correct; the test assumed the clock would move.

## Evidence

- **The failure.** #1469's CI on 2026-10-13 failed the test with `expected undefined to match object { code: 'CONFLICT', … }`. #1469 touches neither the test nor the repository. The whole test took 6 ms, and the re-run passed. The cause was recorded on #1469 before the re-run.
- **Reproduced.** Giving both repositories one fixed clock fails the test locally with the same assertion.
- **Rare.** It is this test's only failure among the 40 most recent failed CI runs, and the test has existed since July.
- **The only such test.** A sweep of every test that writes through a timestamp guard found no other that needs the clock to move between two writes. The others pass explicit times, inject a clock, or make one write. Two test doubles share the guard and default to the wall clock: `FakeUserRepository.updateEmailByClerkId` and a stub in `clerk-webhook-controller-ordering.test.ts`. No test reaches either default.

## Impact

CI only: a red pull request, a written cause and a re-run, about 20 minutes. Production is unaffected.

## Options

1. **Give the conflicting write an explicit, strictly later time,** as the file's other conflict tests do, and freeze the test's clock so that a tie happens on every run. *Chosen:* the test then passes or fails the same way on every run.
2. **Wait a millisecond between the writes.** It still depends on timing.
3. **Treat a tie as later in the repository.** That would change a correct product rule to suit a test: an event observed at the same instant as the stored row would overwrite it.

## Resolution (decided)

Option 1. Both repositories in the test share one fixed instant, which the test checks the two rows carry, and the conflicting write passes `observedAt` one millisecond after the incoming row's `updatedAt`.

## Verification

- [x] With the fixed clock and no explicit time, the test fails with CI's assertion; with the explicit time it passes, three runs in a row (2026-10-13).
- [x] Promoted to `main` by #1485 on 2026-10-13.

## Related

- BUG-320 and BUG-284: the upsert's conflict handling that this test covers.
