# DEBT-462: Observability Instrument Gap — Sentry Tracing at 0 and No Query Analytics Means Five Parked Register Triggers Can Never Fire

**Status:** Open
**Priority:** P3
**Date:** 2026-07-21

---

## Description

Sentry **error tracking** is fully wired and thoughtfully filtered, but Sentry **performance tracing** is explicitly disabled and no query-analytics workflow exists. The 2026-07-20/21 direction campaign parked five register items behind measurement triggers that name Sentry spans and Neon query evidence as their instruments — instruments this repository does not currently produce. Until an instrument exists, those PARKs are silently equivalent to permanent ACCEPTs, which is a register-integrity defect: the campaign's termination rules distinguish "parked until evidence" from "accepted forever", and today that distinction cannot operate.

### What exists (verified 2026-07-21 against `dev` at `fc3c910c`)

- [`@sentry/nextjs@^10.53.1`](../../package.json#L47) installed; server init in [`instrumentation.ts`](../../instrumentation.ts) (DSN-gated, with a `[SENTRY_DISABLED]` production warning when unset), client init in [`sentry.client.config.ts`](../../sentry.client.config.ts) / [`instrumentation-client.ts`](../../instrumentation-client.ts), and [`app/global-error.tsx`](../../app/global-error.tsx) for root-level capture.
- [`lib/report-client-error.ts`](../../lib/report-client-error.ts) routes client action errors to Sentry with an `EXPECTED_BUSINESS_ERROR_CODES` allowlist so expected business outcomes (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `UNSUBSCRIBED`, `RATE_LIMITED`) never become noise. Error-event capture is genuinely production-grade.

### What is missing

- **Tracing is off on both sides:** [`instrumentation.ts:21`](../../instrumentation.ts#L21) sets `tracesSampleRate: 0`; [`sentry.client.config.ts:11-12`](../../sentry.client.config.ts#L11) sets `tracesSampleRate: 0` and `replaysSessionSampleRate: 0`. A repo-wide search finds **zero** `Sentry.startSpan`/metrics usage in production code. No latency, span, or transaction data is ever produced.
- **No query analytics:** no Neon Query Analytics / slow-query-log consultation procedure, no sanitized-`EXPLAIN` capture workflow, and no cardinality-census procedure exists in the repo's runbooks.
- **Provider-side unknown (owner check):** whether `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are actually set in Vercel Production is unverifiable from git. If unset, even error tracking is dark and every production log stream would carry the `[SENTRY_DISABLED]` warning from `instrumentation.ts:3-14`. The owner should confirm the DSN is present before any tracing work builds on it.

### Register items whose named triggers depend on the missing instruments

| Parked item | Named trigger (abbreviated) | Missing instrument |
|---|---|---|
| DEBT-450.1 (finalize `4F` loop) | finalize span p95 ≥ 3s over ≥100 samples/30d, loop-dominant, or a 30s timeout | Sentry server span + Neon statement evidence |
| DEBT-450.3b (bookmark pagination) | any user ≥ 500 bookmarks (monthly census) or `getBookmarks` p95 ≥ 300ms/7d | Sentry span + read-only census procedure |
| DEBT-450.4 (lifetime aggregates) | `getUserStats` DB spans p95 ≥ 300ms/7d or ≥20% of dashboard DB time | Sentry span + Neon Query Analytics |
| DEBT-450.5 (duplicate ranking) | `getAttemptedQuestions` spans ≥ thresholds + sanitized `EXPLAIN (ANALYZE, BUFFERS)` | Sentry span + EXPLAIN workflow |
| DEBT-457.2 (double Stripe retrieve) | attributable Stripe 429 telemetry or webhook p95 ≥ 3s/7d retrieve-dominant | Sentry webhook span with Stripe-call child spans |

The deferred-table item DEBT-349 (cross-request content caching) similarly requires "production metrics prove … a material query-cost bottleneck" before revival.

## Impact

No user-facing defect. Two real costs: (1) **register integrity** — five PARK verdicts cannot ever revive or be honestly re-ACCEPTed, because their evidence channel does not exist; (2) **incident capability** — production diagnosis currently has error events but no latency/span context, so a slow-but-not-erroring regression (the exact class the parked items describe) is invisible until users complain. The fix is small relative to both: configuration plus a handful of named spans.

## Proposed Resolution

1. **Option 1 (RECOMMENDED, minimal):**
   - Owner first confirms the production DSN is set (dashboard check; absence is visible as `[SENTRY_DISABLED]` in Vercel logs).
   - Enable **sampled** tracing with a small, documented rate — either a flat `tracesSampleRate` in the 0.05–0.10 range or a `tracesSampler` that samples only the five trigger surfaces at a higher rate and everything else near zero. Keep `replaysSessionSampleRate: 0`.
   - Add named spans ONLY where the triggers need them: the finalize action (outer transaction), `getBookmarks`, `getUserStats`, `getAttemptedQuestions`, and the Stripe webhook handler with child spans around Stripe API calls.
   - **Span-attribute law (binding, coherent with DEBT-452):** span names/attributes may carry route/action names, durations, counts, and application error codes — never SQL text, bound parameters, raw error messages, or user PII. The DEBT-452 projector's allowlist philosophy governs telemetry attributes too.
   - Document the two companion procedures the triggers assume: how to run the monthly bookmark-cardinality census read-only, and how to capture a sanitized `EXPLAIN (ANALYZE, BUFFERS)` when a trigger fires.
   - Record the Sentry plan/quota bound so sampling cannot silently exceed it.
2. **Option 2 (provider-native only):** skip Sentry tracing; map each trigger to Vercel observability metrics plus Neon Query Analytics/slow-query dashboards, and document the mapping per trigger. No repo code change, but attribution is coarser (route-level, not span-level), several triggers (loop-dominant, retrieve-dominant) become unmeasurable as written, and the evidence lives in dashboards the repo cannot pin. Choose only if Sentry quota is a hard constraint.
3. **Option 3 (honest closure):** explicitly convert the five PARKs to ACCEPTs with accepted-failure sentences, acknowledging the project chooses not to build the evidence channel. This is a new direction ruling across five Direction tables and the index — legitimate, but it forfeits the campaign's evidence-based revival design and leaves incidents without latency context. Not recommended.

## Verification

- Config tests pin the chosen nonzero sampling configuration (rate or sampler shape) so a future edit cannot silently zero it again.
- After one production deploy, the owner records evidence (dashboard screenshot or export reference in this doc) that each of the five named surfaces produced at least one span.
- A source/code-review check confirms no span name or attribute carries SQL, bound parameters, raw messages, or PII (the DEBT-452 attribute law).
- The five parked Direction tables' trigger texts are updated (or confirmed verbatim-compatible) to reference the instruments as actually named in code, so a future trigger evaluation is mechanical.
- The census and EXPLAIN procedures exist in `docs/dev/` and are linked from DEBT-450.

## Related

- [DEBT-101 (archived)](../_archive/debt/debt-101-add-sentry-error-tracking.md) — added the error-tracking layer this item extends; tracing was deliberately left at 0 then and never revisited.
- [DEBT-450](./debt-450-hot-path-query-efficiency.md) parts 1/3b/4/5 and [DEBT-457](./debt-457-wave2-determinacy-and-test-hygiene-residues.md) part 2 — the five parked verdicts whose triggers this item unblocks; [DEBT-349 (deferred)](../_archive/debt/debt-349-cross-request-published-content-caching.md) — same dependency.
- [DEBT-452](./debt-452-db-failure-observability.md) — the diagnostic allowlist law extended here to telemetry attributes.
- Filed 2026-07-21 from the post-campaign complexity assessment (owner-requested); facts verified against source at `fc3c910c`.
