# DEBT-525: Performance Work Needs a Representative Baseline

**Status:** Open — assemble the baseline at the start of performance work, before selecting rendering, scoring, caching or index changes
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Performance work can start without an architecture rewrite. Existing server instrumentation and query-specific triggers supply the starting point, but no retained, representative baseline brings request latency, database waits and recovery progress together. Without it, a local speedup can miss the actual bottleneck or make recovery less reliable.

The owner adopted DEBT-524 option 2 and Resolution steps 1–8 on 2026-10-17. This record owns step 7. It authorizes measurement within the existing collection policy, not changes to rendering, scoring or data collection.

## Evidence

- `lib/sentry-data-collection.ts:399` samples server traces at 5%. `src/adapters/shared/server-tracing.ts:7-26,68-105` defines action spans and their allowed custom attributes. BUG-331 still owns trace/privacy verification and the decision before expanding collection.
- `lib/db.ts:19-22` limits one postgres.js pool to ten clients. Aggregate connection demand and pool waits need measurement alongside query time. BUG-345 supplies the missing server timeout backstop.
- DEBT-450 names Sentry/Neon measurements and the bookmark census. Its scoring description predates ADR-022: `src/application/use-cases/get-user-stats.ts:110-124` requests lifetime count and score plus bounded recent metrics; `src/adapters/repositories/drizzle-attempt-repository.ts:383-428` joins corrected revisions and practice state.
- The root reads the nonce (`app/layout.tsx:72`), while marketing components cache their content (`components/marketing/marketing-layout.tsx:25,55,73`; `marketing-home.tsx:71,93,135,182,253`). Measure actual request/render work rather than treating all content as uncached.
- Recovery shares finite invocation time: reconcile checks its budget between pages (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:120-152`); notice dispatch checks monitoring before business work (`src/adapters/jobs/send-due-renewal-notices.ts:368-423`). DEBT-501 and DEBT-414 own the resulting code changes.
- On 2026-10-16, production's `x-vercel-id` header showed functions in `iad1`; its pooled database hostname showed `us-east-1`.

## Impact

Query latency alone can hide connection waits, lock contention, cached rendering and work that a recovery job never reaches. A baseline makes the existing optimization triggers assessable.

## Options

1. Optimize from isolated timings. Rejected: they do not establish the dominant production cost or recovery progress.
2. Assemble a representative baseline from the existing instrumentation and local controlled workloads. Adopted. Expand collection only after its separate owner decision.

## Resolution (decided)

**Trigger:** the start of the performance pass, before selecting an optimization. No billing or identity refactor is a prerequisite.

- Record the sampled routes/actions, measurement period, representative data cardinalities, concurrency, sample limitations and retention period. Keep credentials, user data and live business metrics out of the public repository; retain operational receipts in the approved location.
- Measure route/query latency, transaction duration, lock and pool waits, and recovery progress. For reconcile, include rows reached, retries and cleanup time. For notices, include the monitoring/GitHub checks and dispatch time. Use existing instrumentation; BUG-331 governs any expansion.
- Use the current ADR-022 scoring queries. Apply DEBT-450's existing slow-query and query-plan procedure before changing scoring or indexes. A rollup/cache is not a prerequisite to measurement.
- Preserve DEBT-420's CSP decision and DEBT-522's `partialPrefetching: false` and upgrade trigger. Reconsider nonce placement only at its function-usage trigger. Preserve DEBT-349's measured bottleneck and invalidation requirements before adding cross-request content caching.
- Browser field measurement and Web Analytics remain under DEBT-479 and DEBT-464, including their source, quota, privacy and hosting decisions.

## Verification

- [x] A second agent checked every receipt, the existing triggers and record rules on 2026-10-17; no substantiated correction. The dated region observations were retained without a new production read.
- [ ] The baseline names its workload, period, retention and limits, with reproducible measurement steps and receipts for the metrics above.
- [ ] Each proposed optimization identifies its measured bottleneck, applicable trigger and before/after check. Work that lacks a fired trigger remains deferred.

## Related

DEBT-524, DEBT-450, DEBT-349, DEBT-420, DEBT-522, DEBT-479, DEBT-464, BUG-331, BUG-345, DEBT-501 and DEBT-414.
