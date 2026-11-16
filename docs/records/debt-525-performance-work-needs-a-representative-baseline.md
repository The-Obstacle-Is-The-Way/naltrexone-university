# DEBT-525: Performance Work Needs a Representative Baseline

**Status:** Open — closes as Reclassified in this pull request: a procedure, not a liability (owner, 2026-11-15)
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

The owner adopted DEBT-524's step 7 on 2026-10-17: measure a representative baseline before choosing rendering, scoring, caching or index changes. This record held that step. It names no current defect. Its trigger, "the start of performance work", is not observable, and before the first live sale production has no representative workload to measure.

## Evidence

Checked at `34d9aea0`.

- The instrumentation the baseline would use exists: server traces sampled at 5% (`lib/sentry-data-collection.ts:418`), the traced action families (`src/adapters/shared/server-tracing.ts:7`), and a ten-client pool (`lib/db.ts:21`). BUG-331's Waiting row holds the owner's decision on the 5% sample.
- Every deferred optimization already waits on its own measured trigger in the index's Waiting table: DEBT-450 (finalize, bookmark pagination, dashboard aggregates and ranking, with the bookmark census and the sanitized EXPLAIN procedure in `docs/guides/database/`), DEBT-349 (cross-request content caching), DEBT-522 (prefetching), and DEBT-479 and DEBT-464 (browser measurement and Web Analytics).
- The first live sale is still ahead (DEBT-512, DEBT-534), so production traffic is not yet representative.

## Impact

None now. Without a baseline, an optimization could miss the real bottleneck; the Waiting rows' evidence requirements already prevent that, part by part.

## Options

1. Keep this record open until performance work starts. It would sit with no observable trigger.
2. Close it as Reclassified, relying on the Waiting rows' triggers. *Recommended.*

## Resolution (decided)

Option 2, decided by the owner on 2026-11-15. Closing declines an owner-adopted step, so it needed the owner's agreement. No guide is added: the only lasting rule, measure the bottleneck before optimizing, is already each Waiting row's trigger.

## Verification

- [x] A second agent checked the receipts and triggers on 2026-10-17.
- [x] The owner agrees to close it as Reclassified. *Agreed 2026-11-15.*

## Related

DEBT-524 (closed), DEBT-450, DEBT-349, DEBT-522, DEBT-479, DEBT-464, BUG-331.

Corrected 2026-11-15: proposed closing as Reclassified; line drift corrected (`lib/sentry-data-collection.ts:418`, `lib/db.ts:21`); the step-by-step measurement plan, which no trigger would start, is in git at `34d9aea0`.
