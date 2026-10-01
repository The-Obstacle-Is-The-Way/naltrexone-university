# Bug Reports — Update History, 2026-10

Update stanzas moved out of the [Bug Reports register](./index.md), newest first, as each read when it left the index. A forward pointer such as "the Latest stanza above" refers to the register's Latest stanza when that update was written.

**Earlier** — 2026-10-01: **BUG-304 (P3), fix in review.**
- **What it fixes.** A Start click that reached the handler of an earlier render was refused silently: no request, no loading state, no alert. That happened after the idempotency key rotated asynchronously, or after a change and a start in one event.
- **How.** The start now reads the learner's latest choice and the current key from refs updated with each change, so every invocation starts what was last chosen. BUG-303's guarantee holds: the earlier key is never submitted, and the newer one is never retired while it may still run.
- **Receipts.** Red first: a browser test changes each starter control and starts in the same event. On the old code none made a request.
- **Closes after release.** The record closes when the fix is released.
