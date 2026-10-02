# Bug Reports — Update History, 2026-10

Update stanzas moved out of the [Bug Reports register](./index.md), newest first, as each read when it left the index. A forward pointer such as "the Latest stanza above" refers to the register's Latest stanza when that update was written.

**Earlier** — 2026-10-02: promotion #1308's review on BUG-314–317 ([BUG-314](../_archive/bugs/bug-314-content-hold-withdrawal-deadlock.md#promotion-review-follow-up--2026-10-02)). BUG-314's attempt-lock case now fails on the real `40P01` deadlock, not a timeout, if activation's lock regresses to `FOR UPDATE`; its probe count is corrected. BUG-314–317 gain the template's archive-convention callout and `Resolved` and `Verification receipts` fields (`—` until their promotion receipts exist). All four stay open until then.

**Earlier** — 2026-10-02: BUG-316's combined migration/cleanup-error test had a race, now fixed ([BUG-316](../_archive/bugs/bug-316-content-release-test-resource-cleanup.md)). After #1302 merged, the case failed CI run `36965916479` with `permission denied for database`. It transferred its database's ownership before drizzle's migrator had created its schema. Reproduced in 12 of 24 concurrent local runs; the test now waits until the injected migration is running, and 24 concurrent runs then passed. BUG-314–317 stay open until their promotion receipts exist.

**Earlier** — 2026-10-02: BUG-314–317 filed from a disposable-Postgres audit:
content writer deadlock/concurrent staging, authored placeholder-prefix archival,
test-resource cleanup, and documentation overclaims. Reproduced before fixing; implementation and review
receipts follow in their records. No production incident is established.

**Earlier** — 2026-10-01: **BUG-304 (P3) is Resolved and archived.**
- **What was fixed.** A Start click that reached the handler of an earlier render was refused silently. Every start now submits the learner's latest choice under the current key, and BUG-303's key guarantees hold.
- **Fix.** #1282 (**5377515605** on `389194ae`, no findings; merged `14a3e800`), promoted through #1283 (`73dcff85`). Codecov's patch check first found two controls untested, and the red-first test now covers every starter control.
- **Release verified.** Main CI **36845119514** `test` **09:59:59Z**; production assigned **10:00:02.594Z**; matching trees `a789dd2c`; healthy production.
- **Remaining.** The original 2026-08-25 click's cause stays unproven. A recurrence would now show a request, a loading state or an alert, and would be a new record.

**Earlier** — 2026-10-01: **BUG-304 (P3), fix in review.**
- **What it fixes.** A Start click that reached the handler of an earlier render was refused silently: no request, no loading state, no alert. That happened after the idempotency key rotated asynchronously, or after a change and a start in one event.
- **How.** The start now reads the learner's latest choice and the current key from refs updated with each change, so every invocation starts what was last chosen. BUG-303's guarantee holds: the earlier key is never submitted, and the newer one is never retired while it may still run.
- **Receipts.** Red first: a browser test changes each starter control and starts in the same event. On the old code none made a request.
- **Closes after release.** The record closes when the fix is released.
