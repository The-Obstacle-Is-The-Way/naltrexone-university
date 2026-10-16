# DEBT-524: Fixing the Open Records One by One Leaves Their Shared Causes in Place

**Status:** Open — challenged assessment; owner decides a narrow billing ownership seam and the added boundary-proof and recovery work, without delaying existing gates
**Priority:** P2
**Date:** 2026-10-16

---

## Summary

The owner asked whether the open records hide a structural problem that should be fixed before individual records and a later performance pass.

**The direction is broadly correct, but the first assessment was incomplete and made the proposed refactor too large a prerequisite.** The inspected domain/application boundaries and existing concurrency primitives support incremental changes; this is not a proof that every path is safe under load. Billing and identity deserve attention, but the deeper problem is keeping replicated facts and recovery paths consistent across independent systems. One application coordinator can reduce drift between callers. It cannot serialize Stripe's hosted completion, guarantee webhook delivery, discover rows outside its scan, or make current price settings into historical facts.

The assessment also needs two causes beyond shared vendors and process cost: tests that omit the deployed boundary, and recovery work whose progress depends on a finite request budget. No evidence justifies a general architecture rewrite or delaying the existing pre-sale gates. A performance baseline can start now; rendering and scoring changes remain behind their existing measurement triggers.

BUG-345 is a confirmed configuration defect: the application timeout options did not take effect on the tested Neon dev pooled connection.

*Corrected 2026-10-16: removed unsupported quantitative and causal claims, added boundary and recovery findings, and restored the existing release and measurement gates.*

## Scope and Evidence Limits

- The first draft preceded #1545. This challenge uses `origin/dev` including #1545, promoted by #1546; exact baseline commits are in the review handoff. The intervening diff changes scheduled-check behavior and its records; those changes are included below. Source line receipts refer to this dev snapshot.
- Read the 39 Active BUG/DEBT records, including these two, the relevant Waiting rows, the cited historical records at their ledger receipts, and the cited implementation paths. The ledger contains 809 closed BUG/DEBT entries: 848 with these 39, not 846. Reproduce with `rg -c '^- (BUG|DEBT)-[0-9]+ ·' docs/records/closed.md` and `rg -c '^\| \[(BUG|DEBT)-[0-9]+\]' docs/records/README.md`.
- The previous family counts, 81% recurrence claim, monthly trends, and source/process size ratios had no reproducible classification or file manifest in the record or branch. They are withdrawn as evidence for priority. Title classification is not a root-cause census; closed entries also include deferred work. The concrete chains below establish recurrence, not its prevalence across all records.
- The live check in this challenge used only the user-designated Neon dev pooled URL, a read-only transaction and `SHOW` statements (BUG-345). No production database, production load test, or new production-region check was used. Earlier production observations are the original author's reports, not this challenge's independent evidence.
- Existing public records are evidence of their documented mechanisms and decisions, not a new legal assessment or authorization to perform owner-only actions. No new concrete defect beyond BUG-345 is claimed here; the added findings connect already-recorded liabilities.

## Evidence

### Finding 1: Replicated Billing and Identity Facts Need Explicit Authority and Recovery

**History supports recurrence, but not one undifferentiated cause.** Duplicate Checkout paths recur in BUG-026, BUG-047, BUG-101, BUG-245, BUG-263 and BUG-343. Provisioning appears in BUG-147, BUG-284, BUG-320 and BUG-332. BUG-242, BUG-243 and BUG-287 concern superseded or stale observations; BUG-286 is a lock-order deadlock, not another stale-write defect. BUG-294 adds deletion's cascade to that lock order, and BUG-296 handles the resulting provider events. BUG-262 concerns recovery-task coupling (Finding 3). The existing fences fixed specific interleavings; this audit does not establish that the whole family stopped after July.

**Identity has shared rules but different synchronization paths.**
- A request with an existing user reads the row and deletion tombstone in parallel; a missing row calls the provisioner (`src/adapters/gateways/clerk-auth-gateway.ts:50-66`). A billing request can explicitly refresh the email (`:69-85`). This is not a claim that all signed-in requests avoid Clerk: provisioning, billing refresh and middleware session refresh remain.
- The webhook ignores `user.created`, while `user.updated` can insert through its upsert. It locks the tombstone before writing (`src/adapters/controllers/clerk-webhook-controller.ts:227-304`); the request path's tombstone check is a separate read. The shared provisioner handles email ownership conflicts; its external lookup precedes a revalidated write. Email selection remains duplicated, with a first-address fallback (`clerk-user-provisioner.ts:54-63`; `clerk-webhook-controller.ts:125-151`).
- DEBT-502 and DEBT-511 cover the distinction between Clerk's verified address, `users.email` and Stripe's customer email. ADR-004 already assigns identity to the verified Clerk session and forbids using email as identity. The missing work is a consistent resolver and freshness policy, not an absence of all authority decisions.
- AUDIT-015 deliberately placed the resolver and notice work before the first renewal-notice deadline, after the pre-sale work. It explicitly keeps the BUG-320/BUG-332 retries as defense after the resolver. Another identity defect is a reason to reassess that order, not automatic authority to replace a narrow fix with the entire resolver.

**Four subscription observation paths share a write fence, not a complete workflow.**
- `src/application/shared/persist-subscription-observation.ts:37-90` reads the local version before retrieving Stripe state, then retries the whole observation on a version conflict. `src/adapters/repositories/drizzle-subscription-repository.ts:104-184` takes the advisory lock, checks the version and applies the domain write guard. Deletion is an additional writer through its cascade; `subscription-write-lock.ts:6-23` includes all five paths in its lock-order contract.
- The webhook claims/locks its event, conditionally maps the customer, records validated consent and queues the acknowledgment, marks termination, then reports a competing subscription (`src/adapters/controllers/stripe-webhook-controller.ts:555-705`). The success page maps the customer after a persisted write (`app/(marketing)/checkout/success/checkout-success-sync.tsx:376-406`). Reconcile maps the customer after a non-version refusal too, marks termination on an accepted canceled observation, and cancels duplicates outside the transaction (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:246-328`). BUG-321's request sync writes the subscription only (`src/application/shared/sync-customer-subscription.ts:69-88`).
- Those differences are not all defects. ADR-014 requires the refused-checkout sync to read Stripe without canceling duplicates; ADR-027 assigns consent capture to the webhook, which has evidence a generic subscription observation lacks. A shared owner must preserve caller authority and evidence requirements, not give every caller identical side effects.
- The success page uses the generic retry helper around raw SDK calls and parses the subscription itself (`checkout-success-sync.tsx:205-258,281-371`). It therefore bypasses the shared Stripe circuit breaker in `src/adapters/gateways/stripe/stripe-retry.ts:38-64`; it does not lack retries. Its dependency builder wires transaction repositories in `checkout-success-deps.ts:19-42`. Reconcile's route selects subscriptions directly (`app/api/cron/reconcile-stripe-subscriptions/route.ts:50-75`), and `lib/container.ts:129-134` exposes raw primitives. These are concrete places to narrow billing policy and wiring. Route-level composition itself is allowed by `.claude/rules/architecture.md`, and ADR-014 explicitly accepted eager-sync duplication; a blanket ban on SDK imports in `app/` is not an existing architectural rule.
- Blocking statuses are independently enumerated in the domain and two Stripe adapters (`src/domain/value-objects/subscription-status.ts:40-41`; `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:58-65`; `src/adapters/jobs/reconcile-stripe-subscriptions.ts:22-29`). They currently agree under the status mapping. That is a drift risk, not a reproduced status mismatch.

**The read model omits facts a shared writer cannot reconstruct.**
- Reconcile starts from local subscription rows (`reconcile-stripe-subscriptions.ts:70-73`), so it cannot discover a provider subscription for a customer with no local subscription row. BUG-321 repairs one request path; DEBT-501 items 1 and 3 cover related coverage and recovery limits.
- The schema keeps one subscription per user (`db/schema.ts:225-259`). That is one local projection, not a guarantee of at most one live Stripe subscription. BUG-343's hosted completion can race outside application locks. Correction must converge duplicates and define compensation, not promise that a local coordinator prevents them.
- **Historical terms are coupled to current configuration.** The repository converts `priceId` to a plan using today's configured IDs and converts the incoming plan back to today's ID (`drizzle-subscription-repository.ts:44-49,104-109`). Notice selection filters on today's annual/monthly IDs, and notice amounts come from configured terms (`src/adapters/jobs/send-due-renewal-notices.ts:79-92,205-219,426-438`). DEBT-501 item 2 therefore needs stored plan, amount and currency plus compatible capture/read/backfill changes. This is a durable-data problem even with one writer; ADR-027 records the present limitation and price-change freeze.

These mechanisms explain BUG-320, BUG-321, BUG-332, BUG-343, DEBT-501, DEBT-502 and DEBT-511, and the renewal-state work in DEBT-414 F22. The distinct content transition in DEBT-483 also has two write paths until the owner-approved production bootstrap. ADR-021 and its existing release/withdrawal boundary already supply its plan; billing consolidation is not its prerequisite.

### Finding 2: Proofs Often Stop Before the Deployed Boundary

This is a separate cause from a vendor changing behavior. A stable provider contract can still be modeled incorrectly.

| Boundary omitted or approximated | Receipt and records explained |
| --- | --- |
| Direct Postgres versus the deployed transaction pooler | `tests/integration/db-connection-session.integration.test.ts:17-24,125-161` sets connection options on direct local Postgres. BUG-345's dev pooled `SHOW` returns different effective bounds. A real database test alone did not prove deployment fidelity. |
| Production-only middleware behavior | `proxy.ts:270-273` selects the live-key limiter. BUG-323 explicitly says development E2E leaves it off and retains an owner production verification. A green E2E run cannot close that check. |
| Real provider refusal versus invented fake behavior | BUG-343's Stripe test-mode receipt disproved the old terminal-Session error assumptions. The corrected fake now refuses non-open Sessions (`src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts:429-470`); the added contract does not prove every hosted-completion interleaving. |
| A mocked SDK versus deployed error handling | `vitest.browser.setup.ts:24-26` stubs Sentry. BUG-319's deployed Server Action failure needed an SDK/deployment-path check beyond that browser suite. |
| Guard coverage versus guard existence | DEBT-519 found exported fakes the fidelity scanner never discovered. BUG-338 tested contact text while its destination was unusable. These are missing coverage/destination checks, not vendor outages. |

Use a boundary-specific proof when changing the relevant seam: pooled timeout behavior, real provider contracts, production-only branch checks, or delivery to the operator. This does not mean running every external service in every unit test. Preserve the existing fake contracts, real-Postgres lanes and observational hosted-Stripe distinction.

### Finding 3: Recovery Needs Coverage, Progress and a Budget of Its Own

- Reconcile's all-pages loop restarts at offset zero and checks its 40-second budget only between pages (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:120-152`). The cron has a 60-second duration, bounds subscription requests separately, and leaves customer cleanup on the SDK defaults (`app/api/cron/reconcile-stripe-subscriptions/route.ts:11-22,94-112`). DEBT-501 item 1 already describes the starvation and timeout exposure. Separate `try` blocks fixed BUG-262's thrown-error coupling; they do not reserve invocation time for cleanup after slow reconciliation.
- Recovery is also incomplete when the operation exists but cannot be invoked. DEBT-414 F23 identifies the wired `RequeueRenewalNoticeDeliveryUseCase` with no operator entry point. ADR-027 requires confirmation before resending an unknown outcome; the planned script must preserve that boundary.
- Observability jobs share an invocation with business work. The renewal job checks the drill and GitHub schedules before selecting notices (`src/adapters/jobs/send-due-renewal-notices.ts:368-423`). The GitHub gateway performs sequential reads, each with a five-second timeout (`src/adapters/gateways/github-scheduled-workflows.ts:13,86-100,145-175`). This is a budget to include in the baseline, not a newly reproduced notice failure.
- #1545 has shipped, promoted by #1546. The renewal job now checks the release and advisory watches for a successful **scheduled** run within a day; a manual run does not count, and a rerun retains the original creation time (`scheduled-checks.ts:158-184`; `github-scheduled-workflows.ts:131-139`). The alert watcher's separate window is three days. GitHub unavailability is deliberately logged rather than alerted; persistent unavailability remains a documented blind spot (`scheduled-checks.ts:102-144`).

DEBT-501, DEBT-414 F23, DEBT-505 and DEBT-523 need explicit coverage, retry/requeue paths, progress evidence and independent failure detection. Moving their orchestration into one class would not establish these properties.

### Finding 4: Shared Test Resources and External Dependencies Are Different Problems

- DEBT-508 isolates Stripe ownership per CI run attempt and per local clone, not per local run. Runs in one clone still share its customer and database. The Clerk development instance and test user remain shared. A user per run could isolate session state, but would not create a new instance-wide API allowance or prove that BUG-333/BUG-337 disappear. Keep DEBT-508's overlap verification and existing coordination until evidence supports changing them.
- BUG-333 does not establish a Clerk JS release as the onset cause. Its cookie-setting behavior existed in the versions compared, and DEBT-521 distinguishes unpinned delivery from proof of a regression. BUG-333 and BUG-337 reproduced without overlapping E2E runs; overlap is not their established cause. BUG-306 and BUG-330 also separate observed session loss from unproven causes.
- BUG-341 was inherited `GIT_DIR` in a linked-worktree hook contaminating a test's `git init`, not the worktree being inside its clone. Moving it outside would not sanitize that environment. DEBT-514's exclusive worktree ownership addresses shared staging; BUG-341's environment-isolated subprocesses address the separate defect. BUG-329 concerns clone-local test infrastructure.
- DEBT-445 separately records shared Preview database/migration-ledger exposure. Its owner-enabled preview-branch isolation remains a separate requirement; per-run Clerk users or Stripe metadata namespaces do not isolate database schemas.
- Hosted Stripe labels (BUG-340), Codecov delivery (DEBT-510), registry availability (DEBT-516), and GitHub push/schedule delivery (DEBT-523) need their own contracts or recovery. BUG-336, BUG-339 and BUG-342 are test/tooling defects, not evidence that shared identity causes the entire group.

### Finding 5: Process Cost Is Real, but Its Controls Have Different Purposes

There are ten scheduled workflow files and two Vercel crons in this snapshot. The release and advisory watches detect missing work; the alert watcher detects failures outside Sentry. BUG-335, BUG-339, BUG-341, BUG-344, DEBT-510, DEBT-514, DEBT-515, DEBT-518 and DEBT-519 show that the delivery system has its own maintenance burden. They do not prove the withdrawn percentages or that script size determines review throughput.

DEBT-518 owns review capacity and documentation upkeep. DEBT-512 requires reevaluating timing and logging after the hosting upgrade, not retiring independent watches automatically. Longer log retention does not detect a stopped schedule, missing deployment, expired read token or Sentry failure by itself; AUDIT-015 explicitly requires detection outside Sentry. Replace a control only after its replacement proves the same failure detection.

A quiet production window is limited evidence, as BUG-320 says. It does not authorize closing every Verifying record at promotion: BUG-323 requires a positive execution receipt, and DEBT-505 requires alert delivery. Any change to the index's closure rules must distinguish these obligations and preserve existing dated checks until individually replaced.

### Finding 6: Performance Work Can Start with Measurement

The inspection found no prerequisite general rewrite. It also cannot certify that locking, indexes or capacity are safe at arbitrary load.

- **Locks have different scopes.** The subscription lock is keyed by user, the Stripe event lock by event, practice creation takes shared question-row locks, and content writers serialize on the shared release pointer (`subscription-write-lock.ts:6-23`; `stripe-webhook-controller.ts:569-579`; `drizzle-practice-session-repository.ts:624-639`; `scripts/content-release/release-activation.ts:106-113`). The inspected billing paths retrieve vendor state before their write transactions. Neither that observation nor `SKIP LOCKED` in selected cleanup queries is a whole-repository concurrency proof. BUG-345 invalidates the assumed pooled timeout backstop.
- **Connection limits are per instance.** `lib/db.ts:19-22` limits one postgres.js pool to ten clients; it is not a service-wide connection or active-transaction budget. A concurrency baseline needs queue/pool pressure as well as query time. DEBT-447 accepted this pool size and deferred capacity changes; no new exhaustion incident is claimed.
- **Instrumentation already exists.** `lib/sentry-data-collection.ts:399` samples server traces at 5%, and `src/adapters/shared/server-tracing.ts:7-26,68-105` defines action spans with allowed custom attributes. DEBT-450 names Sentry/Neon measurements and the bookmark census. Browser field measurement and Web Analytics are separate deferred work (DEBT-479, DEBT-464), not proof that nothing collects server measurements. A retained representative baseline still needs to be assembled. BUG-331's pending trace/privacy decision applies before expanding collection; custom attributes already being allowed does not mean all SDK spans use that projection.
- **Dynamic work does not imply rerendering all cached content.** The root reads the nonce (`app/layout.tsx:72`), while marketing components use `use cache` (`components/marketing/marketing-layout.tsx:25,55,73`; `marketing-home.tsx:71,93,135,182,253`). DEBT-420 accepted report-only CSP; DEBT-522 accepted `partialPrefetching: false`, its Next upgrade trigger and a nonce reconsideration only near the hosting allowance. Preserve those decisions while measuring actual request/render work.
- **Scoring has changed since DEBT-450.** `GetUserStatsUseCase` requests lifetime count and score plus bounded recent metrics (`src/application/use-cases/get-user-stats.ts:110-124`); `scoreByUserId` joins questions, sessions, question state and corrected revisions (`src/adapters/repositories/drizzle-attempt-repository.ts:383-428`). A new baseline must use this ADR-022 query shape, not the old two-count description. DEBT-450 Part 4 rejected rollup/cache without its trigger and chose consolidation only after measurement. It does not require deciding on a rollup before a performance pass. DEBT-349 likewise needs both a measured bottleneck and a content-invalidation path.

## Impact

Repeated fixes at individual callers can leave observation policy, historical terms and recovery coverage inconsistent. Green tests can miss those defects when their environment or fake omits the relevant boundary. Shared test resources and external delivery failures also consume review and release time. These are mechanisms supported by the cited records, not measured prevalence or a prediction of production capacity.

## Options

1. **Continue the existing record plans without a separate extraction.** This preserves the decided gates and minimizes immediate change, but each billing change must explicitly cover the relevant writers, stored facts and recovery paths.
2. **Define and extract a narrow shared subscription observation contract as the related billing work needs it** (recommended for owner consideration). Keep caller-specific evidence and authority explicit; accompany it with boundary proofs and recovery coverage. This reduces duplicated policy without claiming that one local writer controls Stripe's lifecycle.
3. **Make the application the creator of subscriptions**, through setup-mode Checkout followed by server creation (BUG-343 option 8). That changes the boundary of the hosted-completion race, but also changes purchase UX, disclosures and consent under DEBT-414. It remains a larger product/design decision, not a prerequisite for the current pre-sale fixes.

Test-resource isolation, measured process simplification and a performance baseline can proceed independently under their owning records.

## Resolution (proposed; the owner decides)

1. **Fix BUG-345 independently**, with proof through a transaction pooler and an explicit migration-connection decision. Do not assume changing runtime startup options changes build-time migrations.
2. **Define the narrow billing contract before extracting it.** State fact authority, observation/version fencing, deletion lock order, and caller-specific consent/cancellation permissions. Amend ADR-014/ADR-027 where behavior changes; clarify ADR-002's local one-row invariant separately from provider duplicate correction. Then consider one application seam for the shared subscription observation and persistence policy, with adapters retaining SDK normalization and retries. Do not mandate identical side effects or add a broad import scanner without a demonstrated invariant it protects.
3. **Keep the existing pre-sale order and gates.** DEBT-501 item 2's stored terms and BUG-343 option 4 can incorporate the needed seam incrementally. They do not each necessarily touch all four callers, and the owner has not approved a separate refactor as a release prerequisite. DEBT-501 item 3 remains trigger-based under AUDIT-015, not a newly invented pre-sale gate. Preserve DEBT-414's evidence and owner decisions.
4. **Design recovery with the population and budget it must cover.** In DEBT-501, separately evaluate customers with no local subscription, fair progress across existing rows, and cleanup time. A scan of `stripe_customers` still cannot discover a missing customer mapping; name that residual and the evidence source. Keep duplicate correction/compensation under BUG-343. Implement DEBT-414 F23's supported requeue path before its existing deadline. Do not substitute alerts for these recovery mechanisms.
5. **Keep identity's existing deadline**, unless the owner brings it forward. DEBT-502 supplies the resolver; DEBT-511 supplies verified notice destinations. Preserve ADR-004's identity rules and retries as defense. If adding `user.created`, explicitly decide webhook/request fallback and deletion behavior rather than assuming a webhook removes request concurrency.
6. **Add proof at each changed boundary**, under the owning record: BUG-345's pooled check, BUG-321/BUG-343's real Stripe contract, BUG-319/BUG-323's deployed-path checks, and DEBT-519's discovery coverage. Evaluate per-run Clerk users under DEBT-508 with instance budget and session-loss controls. Keep exclusive worktrees and sanitized subprocess environments as separate measures.
7. **Build the performance baseline now.** Include route/query latency, transaction/lock and pool waits, recovery-job progress, representative cardinalities, and retention. Use existing instrumentation subject to BUG-331's owner decision. Select rendering, scoring, caching or index changes only after their existing triggers and current query-plan evidence; do not make them prerequisites to measurement.
8. **Review process changes under DEBT-518 and DEBT-512.** Retire a check only with equivalent evidence or an explicit owner acceptance of its residual. Do not remove independent alert/schedule detection merely because Pro is enabled, or close positive-verification obligations on absence of errors.

All other records retain their existing plans and deadlines. This assessment changes neither production settings nor those records' authorization.

## Verification

- [x] First branch challenge on 2026-10-16; its corrections are retained where supported.
- [x] Further challenge against the dev snapshot above, the intervening diff, all Active records and relevant historical decisions; corrected unsupported counts/causes and added deployment-boundary, durable-fact and recovery-budget findings.
- [x] BUG-345 re-observed on Neon dev using only `SHOW` inside `sql.begin("read only")`.
- [ ] Owner decides whether to adopt the narrow billing seam and additions to the existing records. No new release gate is adopted by this assessment alone.
- [ ] Before closure, each adopted action has a home: billing/recovery in DEBT-501 and BUG-343, identity/notices in DEBT-502/DEBT-511/DEBT-414, test boundaries in their defect records and DEBT-508/DEBT-519, performance in the existing measurement-triggered work, and process changes in DEBT-518/DEBT-512. Preserve unadopted proposals as decisions, not implied work orders.
