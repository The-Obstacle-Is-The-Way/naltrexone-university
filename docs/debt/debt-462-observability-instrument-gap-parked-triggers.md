# DEBT-462: Observability Instrument Gap Prevents Mechanical Evaluation of Five Parked Register Triggers

**Status:** Open
**Priority:** P3
**Date:** 2026-07-21

---

## Direction (2026-07-21 filing review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Repo-owned measurement path | **FIX (Option 1, minimal form)** | Set **server** `tracesSampleRate: 0.05`, keep client tracing and all replay sampling at `0`, and add exactly five named server instrumentation families: finalize, `getBookmarks`, `getUserStats`, `getAttemptedQuestions`, and one Stripe family comprising the webhook parent plus its Stripe API child spans. Add the two read-only measurement procedures and tests for the fixed sampling shape and narrow attribute allowlist. | Option 1's trigger-surface `tracesSampler`; enabling client tracing/replays; Option 2's provider-only mapping; Option 3's five cross-doc ACCEPT rewrites. | (a) A flat server rate plus five instrumentation families is less policy than a route sampler; (b) the latency limbs are currently unobservable, though timeout/429/manual-census alternatives remain; (c) blast radius is PARK decisions that cannot be evaluated mechanically, while the fix is bounded config/spans/docs; (d) one named evidence path replaces ad hoc archaeology; (e) the narrower DEBT-452-style allowlist preserves the campaign's error-seam law. |
| 2. Production Sentry readiness | **OWNER-GATED (manual precondition)** | Before enabling the nonzero rate, the owner checks the Vercel Production `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, confirms one current production error event arrives in the intended Sentry project/environment, and records that project's trace quota/retention plus a 5% volume budget in this doc. Historical DEBT-241 configuration is evidence, not proof of current state. | Assuming the 2026-02-22 dashboard state still holds; scripting Vercel/Sentry live changes from the fix wave; hardcoding a vendor-plan limit from public docs. | (a) Uses one dashboard check rather than provider automation; (b) git cannot prove current env/project delivery; (c) dark DSNs or exhausted quota would make the repo change inert, while the manual check is small; (d) closes DEBT-241's unchecked production-event proof; (e) provider state remains owner-owned. |

All five target measurement families are server-side, so 5% flat server sampling is the smallest sufficient mechanism; client tracing and replay sampling remain off. This filing restores the missing latency-evidence path but does not claim every trigger was impossible: finalize timeout, bookmark census, Stripe 429, and provider/manual query evidence can still surface independently. DEBT-349 remains outside the five-family scope because its two-part revival also requires a Next-runtime invalidation seam.

**2026-07-21 filing-review corrections:** the manifest declares `@sentry/nextjs@^10.53.1`, but `pnpm-lock.yaml` resolves **10.65.0**; `app/global-error.tsx` renders/logs the fallback and does not itself call Sentry. The original “five triggers can never fire” wording was too broad, and DEBT-450.3b omitted “after Part 3a lands” while DEBT-450.5 compressed an either/or threshold plus mandatory dominant sanitized `EXPLAIN` into an inaccurate “thresholds + EXPLAIN.” DEBT-241 also records that both DSNs were added to all Vercel environments on 2026-02-22, but its production-event verification remained unchecked, so current delivery is owner-gated rather than assumed. A missing server DSN causes `instrumentation.register()` to emit one `[SENTRY_DISABLED]` warning per invocation/runtime initialization, not a warning in every log stream. The five-span wording was ambiguous because Stripe needs a webhook parent and API-call children; those spans are one Stripe instrumentation family, keeping the binding total at exactly five families.

**Priority ruling:** keep **P3**. This is an enabler rather than a user-facing defect, but five binding PARK decisions currently lack their repeatable latency-evidence path; the register-integrity failure is live and the chosen repo fix is bounded.

## Description

Sentry **error-tracking code paths** are wired and thoughtfully filtered, but current production delivery remains provider-state evidence rather than a fact git can prove. Sentry **performance tracing** is explicitly disabled and no query-analytics workflow exists. The 2026-07-20/21 direction campaign parked five register items behind measurement triggers whose latency limbs name Sentry spans and Neon query evidence — instruments this repository does not currently produce or operationalize. Alternative timeout, 429, census, and manual/provider evidence can still revive some items, but the intended repeatable latency-evaluation path cannot operate.

### What exists (verified 2026-07-21 against `dev` at `fc3c910c`)

- [`package.json:47`](../../package.json#L47) declares `@sentry/nextjs@^10.53.1`; the lockfile resolves `10.65.0`. Server init lives in [`instrumentation.ts`](../../instrumentation.ts) (DSN-gated, with a `[SENTRY_DISABLED]` production warning when unset), and client init lives in [`sentry.client.config.ts`](../../sentry.client.config.ts) / [`instrumentation-client.ts`](../../instrumentation-client.ts). [`app/global-error.tsx`](../../app/global-error.tsx) renders the root fallback and calls only `console.error`; it contains no explicit Sentry capture.
- [`lib/report-client-error.ts`](../../lib/report-client-error.ts) exposes `shouldReportClientError` with an `EXPECTED_BUSINESS_ERROR_CODES` allowlist plus the separate `reportClientError` capture helper; relevant client call sites use the predicate before reporting returned action errors. The allowlist contains `VALIDATION_ERROR`, `UNAUTHENTICATED`, `UNSUBSCRIBED`, and `RATE_LIMITED`. The repo-side filtering path is deliberate; current production delivery remains subject to the owner-gated proof above.

### What is missing

- **Tracing is off on both sides:** [`instrumentation.ts:21`](../../instrumentation.ts#L21) sets `tracesSampleRate: 0`; [`sentry.client.config.ts:11-12`](../../sentry.client.config.ts#L11) sets `tracesSampleRate: 0` and `replaysSessionSampleRate: 0` (`replaysOnErrorSampleRate` is also `0` at line 13). A repo-wide production search finds **zero** `Sentry.startSpan` or Sentry metrics usage, so these configs send no sampled performance events for the named surfaces.
- **No query analytics:** no Neon Query Analytics / slow-query-log consultation procedure, no sanitized-`EXPLAIN` capture workflow, and no cardinality-census procedure exists in the repo's runbooks.
- **Provider-side current state is owner-gated:** archived DEBT-241 records both DSNs added to all Vercel environments on 2026-02-22, but its production-event verification boxes remained unchecked and git cannot prove current dashboard state. If the server DSN fallback pair is now unset, server error tracking is dark and `instrumentation.register()` warns with `[SENTRY_DISABLED]`; the client independently requires `NEXT_PUBLIC_SENTRY_DSN`. The owner must confirm current DSNs, event delivery, project/environment, and quota before nonzero tracing ships.

### Register items whose named triggers depend on the missing instruments

| Parked item | Named trigger (abbreviated) | Missing instrument |
|---|---|---|
| DEBT-450.1 (finalize `4F` loop) | one 30-second timeout, or — over at least 100 production finalizations (or 30 days, whichever comes first) — finalize p95 ≥ 3 seconds with the loop dominant; Neon statement evidence is required before selecting SQL | Sentry server span + Neon statement evidence |
| DEBT-450.3b (bookmark pagination) | after Part 3a lands: any monthly census user ≥ 500 bookmarks, or sampled `getBookmarks` p95 ≥ 300 ms for 7 consecutive days | Sentry span + read-only census procedure |
| DEBT-450.4 (lifetime aggregates) | sampled `getUserStats` DB p95 ≥ 300 ms for 7 consecutive days, or the two lifetime aggregates consume ≥ 20% of dashboard DB time | Sentry span + Neon Query Analytics |
| DEBT-450.5 (duplicate ranking) | sampled `getAttemptedQuestions` DB p95 ≥ 300 ms/7d **or** the two rank statements ≥ 20% of route DB time, **and** sanitized `EXPLAIN (ANALYZE, BUFFERS)` confirms duplicate ranking/sort work is dominant | Sentry span + Neon evidence + EXPLAIN workflow |
| DEBT-457.2 (double Stripe retrieve) | attributable Stripe 429 telemetry or webhook p95 ≥ 3s/7d retrieve-dominant | One Stripe instrumentation family: Sentry webhook parent with Stripe-call child spans |

The deferred-table item DEBT-349 also names missing measurement, but it is not part of this filing's five-family fix: its exact two-part trigger additionally requires 7-day published-read volume/database-time evidence and a Next-runtime invalidation seam.

## Impact

No user-facing defect. Two real costs: (1) **register integrity** — the five PARK verdicts' repeatable latency limbs cannot be evaluated or honestly re-ruled from repo-owned evidence; (2) **incident capability** — the repo has error-event paths but no latency/span context, so a slow-but-not-erroring regression may remain invisible until an alternate trigger or user report appears. The fix is small relative to both: one server sampling value, five bounded span families, and two procedures.

## Proposed Resolution

1. **Option 1 (CHOSEN, minimal form):**
   - **OWNER-GATED precondition:** the owner checks both Production DSNs in Vercel, confirms a current production error event in the intended Sentry project/environment, and records that project's current trace quota/retention plus a 5% volume budget in this doc. Do not script live provider changes in the fix wave.
   - Set server `tracesSampleRate: 0.05`. Keep client `tracesSampleRate: 0`, `replaysSessionSampleRate: 0`, and `replaysOnErrorSampleRate: 0`; all five target surfaces execute server-side, so client telemetry is unnecessary. A trigger-surface `tracesSampler` is rejected because it adds routing policy and naming-coupled sampling for no demonstrated quota need.
   - Add exactly five named instrumentation families ONLY where the triggers need them: the finalize action (outer transaction), `getBookmarks`, `getUserStats`, `getAttemptedQuestions`, and **one Stripe family** containing the webhook-handler parent span and its Stripe API child spans. The child spans do not create additional registered families.
   - **Span-attribute law (binding, extending rather than reusing DEBT-452):** this narrower telemetry allowlist permits only stable route/action/operation names, durations, coarse counts, and application error codes. Never attach SQL text, PostgreSQL detail, constraint names, bound parameters, raw error messages, stack/cause text, user IDs, idempotency keys, Stripe IDs, or other PII. DEBT-452's allowlist principle governs the boundary, but its diagnostic projector is not a generic span-attribute serializer.
   - Document the two companion procedures the triggers assume: how to run the monthly bookmark-cardinality census read-only, and how to capture a sanitized `EXPLAIN (ANALYZE, BUFFERS)` when a trigger fires.
   - Record the owner-confirmed Sentry plan/quota bound and an observed first-week trace volume after deploy so the fixed rate cannot silently exceed it.
2. **Option 2 (REJECTED BY DIRECTION REVIEW):** provider-native-only mapping leaves loop-dominant and retrieve-dominant triggers coarser than their binding text, and dashboard-only evidence cannot be pinned by repo tests. Reconsider only through a new ruling if the owner-gated quota check proves 5% Sentry tracing infeasible.
3. **Option 3 (REJECTED BY DIRECTION REVIEW):** converting all five PARKs to ACCEPT would require five new direction rulings and would discard viable bounded measurement merely to avoid a small evidence path.

## Verification

- Config tests pin server `tracesSampleRate: 0.05` and client tracing plus both replay rates at `0`.
- Before that config ships, the owner records the DSN/event-delivery/project/environment check and current trace quota/retention plus 5% budget; after deploy, the owner records a dashboard screenshot/export reference proving each named surface emitted at least one span and records first-week volume.
- Focused tests or pure-attribute-builder tests prove the telemetry allowlist, and a source review confirms no span name/attribute carries SQL, PostgreSQL detail/constraint, bound parameters, raw messages, stack/cause text, identifiers, or PII.
- A structural test pins exactly five instrumentation families and treats the webhook parent plus every bounded Stripe API child operation as members of the single Stripe family; implementation and runbook names use the same grouping.
- The five parked Direction tables remain semantically unchanged and reference the actual span names in code; DEBT-450.3b retains its post-Part-3a condition and DEBT-450.5 retains its either/or threshold plus mandatory dominant sanitized EXPLAIN.
- The read-only census and sanitized EXPLAIN procedures exist in `docs/dev/` and are linked from DEBT-450; no procedure mutates Neon.

## Related

- [DEBT-101 (archived)](../_archive/debt/debt-101-add-sentry-error-tracking.md) — added the error-tracking layer this item extends but did not choose a performance-tracing policy; [DEBT-241 (archived)](../_archive/debt/debt-241-sentry-dsn-missing-from-vercel-environments.md) later recorded the DSN dashboard action and the still-zero sample rates.
- [DEBT-450](./debt-450-hot-path-query-efficiency.md) parts 1/3b/4/5 and [DEBT-457](../_archive/debt/debt-457-wave2-determinacy-and-test-hygiene-residues.md) part 2 — the five parked verdicts whose triggers this item unblocks; [DEBT-349 (deferred)](../_archive/debt/debt-349-cross-request-published-content-caching.md) — same dependency.
- [DEBT-452](./debt-452-db-failure-observability.md) — the diagnostic allowlist law extended here to telemetry attributes.
- Filed 2026-07-21 from the post-campaign complexity assessment (owner-requested); facts verified against source at `fc3c910c`.
