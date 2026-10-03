# Bug Reports — Update History, 2026-10

Update stanzas moved out of the [Bug Reports register](./index.md), newest first, as each read when it left the index. A forward pointer such as "the Latest stanza above" refers to the register's Latest stanza when that update was written.

**Earlier** — 2026-10-03: BUG-310 is fixed in code, as decided ([BUG-310](../_archive/bugs/bug-310-trial-add-card-offers-non-card-methods.md#fix--2026-10-03)).
- **The setup Session offers only cards.** `payment_method_types: ['card']` on the trial add-card Session; paid Checkout keeps dynamic methods, now pinned by a test.
- **Setup completion accepts only a card that Stripe saved.** The webhook retrieves the SetupIntent with its payment method expanded and requires `status: 'succeeded'` and a `card`. Anything else fails the event before any write, with a logged error; nothing is attached or recorded.
- **The hosted journey checks the Session Stripe recorded**, and replays Stripe's actual completion event through the signed webhook route, so both checks run against real Stripe.
- **Evidence.** Nine targeted mutations each fail a case.
- **The decision is released.** #1326 recorded it (**5399102258** on `e02322f8`; merged `8c999ccf`). It reached production with #1327 through promotion #1328 (`220b95c7`): main CI **37102616298** `test` passed **06:32:10Z**, production assigned **06:32:11.842Z**, trees `22a83f23`, healthy production.

This entry was written before this increment's own checks ran; its local full gate runs on its head before it is pushed, and the next entry records its merge and release.

**Earlier** — 2026-10-03: BUG-310 is decided, under the owner's 2026-10-03 delegation ([BUG-310](../_archive/bugs/bug-310-trial-add-card-offers-non-card-methods.md#decision--2026-10-03)).
- **Decision.** The trial add-card Checkout offers cards only (`payment_method_types: ['card']` on the setup Session). Its completion attaches nothing unless the SetupIntent succeeded with a card. Paid Checkout keeps dynamic payment methods: its copy says "payment method", and access waits on the subscription's status.
- **Next.** The fix, test-first, is the next code PR.
- **BUG-317's deferred question**, whether the withdrawn label suits held or dropped questions, is decided by [ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md) and implemented by [DEBT-493](../debt/debt-493-learner-scores-and-labels-when-content-changes.md). Its row leaves the debt register's Deferred table.

**Earlier** — 2026-10-02 (forward pointer: the Latest stanza above records that ADR-022 decides BUG-317's deferred question): **BUG-314–317 are resolved and archived** ([BUG-314](../_archive/bugs/bug-314-content-hold-withdrawal-deadlock.md#verified-closeout--2026-10-02-utc)).
- **Shipped.** Content writers serialize on the release pointer, and content and session locks are ordered (BUG-314, P2). Placeholder archival is limited to the ten committed fixtures (BUG-315, P2). Disposable test databases clean up after failures (BUG-316, P3). Release guidance matches the code (BUG-317, P3).
- **History.** BUG-314 and BUG-315 were in shipped code; no production incident is established.
- **Fixes.** #1302 (**5388054704** on `69733bb9`; merged `93f8104a`), with follow-ups in #1305, #1309 and #1311.
- **Re-verified** on `main`'s code before archival: 15 integration files, 163 cases.
- **Released** through promotion #1312 (`7dcb9331`): main CI **36991253547**, production assigned **09:55:02.296Z**, trees `d1e952d0`.
- **Deferred.** BUG-317's open owner question, whether the withdrawn label suits held or dropped questions, moves to the debt register's Deferred table. This register has none.

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
