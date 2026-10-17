# DEBT-524: Fixing the Open Records One by One Leaves Their Shared Causes in Place

**Status:** Open — owner decides shared billing rules, tests of deployed paths and recovery additions; existing gates and deadlines remain
**Priority:** P2
**Date:** 2026-10-16

---

## Summary

**Green light: no rewrite is needed first.** Work through the records in their existing order, adding shared billing rules, tests of deployed paths, and recovery coverage and time budgets as you go.

The domain/application boundaries and existing concurrency controls support incremental changes. The deeper billing and identity problem is keeping copied facts and recovery paths consistent across systems. One application coordinator can reduce differences between callers. It cannot control Stripe's hosted completion, guarantee webhook delivery, discover rows outside its scan, or turn current prices into historical terms.

Shared test resources, vendor dependencies and process upkeep also need work under their existing records. Start the performance baseline now. Rendering and scoring changes retain their measurement triggers. BUG-345 separately needs a timeout fix: the application settings did not take effect through Neon's pooler.

*Corrected 2026-10-16: removed unsupported quantitative and causal claims, added boundary and recovery findings, and restored the existing release and measurement gates.*

*Corrected 2026-10-17: recorded the baseline commits, restored dated production observations, and incorporated DEBT-515's decision in ADR-024.*

## Scope and Evidence Limits

- Baselines: the first draft read main `78ebccc0`; the challenge read dev `74a8bcd9` (main `10a6cee9`, the same tree). Source line receipts use that dev snapshot. Its diff from the first baseline includes #1545's scheduled-check changes, promoted in #1546. The 2026-10-17 update includes #1547's DEBT-515 decision, promoted as main `8da8f270` in #1548.
- The 2026-10-16 source review covered all 39 Active BUG/DEBT records, including these two, relevant Waiting rows, cited history at its ledger receipts, and cited code. The ledger has 809 closed entries, 848 with the 39 Active; both counts still held on 2026-10-17. Reproduce with `rg -c '^- (BUG|DEBT)-[0-9]+ ·' docs/records/closed.md` and `rg -c '^\| \[(BUG|DEBT)-[0-9]+\]' docs/records/README.md`.
- The earlier family counts, 81% recurrence claim, monthly trends and source/process size ratios are withdrawn. They lacked a reproducible classification or file manifest. Titles do not establish causes, and closed entries include deferred work. The chains below establish recurrence, not its prevalence.
- Production, read 2026-10-16 through its pooled URL with `SHOW` inside a read-only transaction: statement timeout `0`, lock timeout `0`, idle-in-transaction timeout `5min`, time zone `GMT`. Neon dev, the same day and method: the same values (BUG-345).

Evidence limits: source review and the dated observations below establish mechanisms, not load capacity, outage frequency, complete pool coverage or legal conclusions; only BUG-345 is a new concrete defect, and owner decisions retain their existing authority.

## Evidence

### Finding 1: Replicated Billing and Identity Facts Need Explicit Authority and Recovery

**The recurring defects have distinct causes.**

- Duplicate Checkout paths: BUG-026, BUG-047, BUG-101, BUG-245, BUG-263 and BUG-343.
- Provisioning: BUG-147, BUG-284, BUG-320 and BUG-332.
- Superseded or stale observations: BUG-242, BUG-243 and BUG-287. BUG-286 instead concerns lock order. BUG-294 adds deletion's cascade to that order; BUG-296 handles the resulting provider events.
- Recovery-task coupling: BUG-262 (Finding 3). Existing fences fix specific interleavings; the history does not establish that recurrence stopped after July.

**Identity has shared rules but different synchronization paths.**

- A request with an existing user reads the row and deletion tombstone in parallel; a missing row calls the provisioner (`src/adapters/gateways/clerk-auth-gateway.ts:50-66`). Billing can refresh the email (`:69-85`). Provisioning, billing refresh and middleware session refresh still call Clerk.
- The webhook ignores `user.created`, while `user.updated` can insert through its upsert. It locks the tombstone before writing (`src/adapters/controllers/clerk-webhook-controller.ts:227-304`); the request path's tombstone check is a separate read. The shared provisioner handles email ownership conflicts; its external lookup precedes a revalidated write. Email selection remains duplicated, with a first-address fallback (`clerk-user-provisioner.ts:54-63`; `clerk-webhook-controller.ts:125-151`).
- DEBT-502 and DEBT-511 distinguish Clerk's verified address, `users.email` and Stripe's customer email. ADR-004 assigns identity to the verified Clerk session and forbids email as identity. A consistent resolver and freshness policy remain to be built.
- AUDIT-015 places the resolver and notice work after the pre-sale work, before the first renewal-notice deadline. It keeps the BUG-320/BUG-332 retries as defense afterward. Another identity defect can justify reassessing that order; it does not automatically require the entire resolver first.

**Four subscription observation paths share a write fence, not a complete workflow.**

- `src/application/shared/persist-subscription-observation.ts:37-90` reads the local version before retrieving Stripe state, then retries the whole observation on a version conflict. `src/adapters/repositories/drizzle-subscription-repository.ts:104-184` takes the advisory lock, checks the version and applies the domain write guard. Deletion is an additional writer through its cascade; `subscription-write-lock.ts:6-23` includes all five paths in its lock-order contract.
- The webhook claims/locks its event, conditionally maps the customer, records validated consent and queues the acknowledgment, marks termination, then reports a competing subscription (`src/adapters/controllers/stripe-webhook-controller.ts:555-705`).
- The success page maps the customer after a persisted write (`app/(marketing)/checkout/success/checkout-success-sync.tsx:376-406`). Reconcile maps it after a non-version refusal too. Reconcile also marks termination on an accepted canceled observation and cancels duplicates outside the transaction (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:246-328`). BUG-321's request sync writes only the subscription (`src/application/shared/sync-customer-subscription.ts:69-88`).
- ADR-014 requires the refused-checkout sync to read Stripe without canceling duplicates. ADR-027 assigns consent capture to the webhook, which has the required evidence. Shared rules must preserve those different permissions and side effects.
- The success page retries raw SDK calls and parses subscriptions itself (`checkout-success-sync.tsx:205-258,281-371`). Its generic retry helper bypasses the shared Stripe circuit breaker (`src/adapters/gateways/stripe/stripe-retry.ts:38-64`).
- Billing wiring is spread out. The success page builds transaction repositories (`checkout-success-deps.ts:19-42`), reconcile's route selects subscriptions (`app/api/cron/reconcile-stripe-subscriptions/route.ts:50-75`), and `lib/container.ts:129-134` exposes raw primitives. These are candidates for shared billing rules. `.claude/rules/architecture.md` permits route-level composition; ADR-014 accepted eager-sync duplication. There is no blanket rule against SDK imports in `app/`.
- Three places enumerate blocking statuses: `src/domain/value-objects/subscription-status.ts:40-41`, `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:58-65` and `src/adapters/jobs/reconcile-stripe-subscriptions.ts:22-29`. They agree under the status mapping today. Maintaining three lists risks future drift.

**The read model omits facts a shared writer cannot reconstruct.**

- Reconcile starts from local subscription rows (`reconcile-stripe-subscriptions.ts:70-73`), so it cannot discover a provider subscription for a customer with no local subscription row. BUG-321 repairs one request path; DEBT-501 items 1 and 3 cover related coverage and recovery limits.
- The schema keeps one subscription per user (`db/schema.ts:225-259`). Stripe can still have several: BUG-343's hosted completion can race outside application locks. Recovery must correct duplicates and define compensation.
- **Historical terms depend on current configuration.** The repository maps `priceId` to a plan and an incoming plan back to a price using today's IDs (`drizzle-subscription-repository.ts:44-49,104-109`). Notices filter on today's annual/monthly IDs and use configured amounts (`src/adapters/jobs/send-due-renewal-notices.ts:79-92,205-219,426-438`). DEBT-501 item 2 needs stored plan, amount and currency, with compatible capture, reads and backfill. One writer alone cannot supply missing history. ADR-027 records this limitation and freezes price changes.

These mechanisms explain BUG-320, BUG-321, BUG-332, BUG-343, DEBT-501, DEBT-502, DEBT-511 and DEBT-414 F22. Content has its own two-path transition until DEBT-483's production bootstrap. ADR-021 already defines its release/withdrawal plan; it can proceed independently of billing.

### Finding 2: Proofs Often Stop Before the Deployed Boundary

Tests can model even a stable provider contract incorrectly.

| Boundary omitted or approximated | Receipt and records explained |
| --- | --- |
| Direct Postgres versus the deployed transaction pooler | `tests/integration/db-connection-session.integration.test.ts:17-24,125-161` sets connection options on direct local Postgres. BUG-345's dev pooled `SHOW` returns different effective bounds. A real database test alone did not prove deployment fidelity. |
| Production-only middleware behavior | `proxy.ts:270-273` selects the live-key limiter. BUG-323 explicitly says development E2E leaves it off and retains an owner production verification. A green E2E run cannot close that check. |
| Real provider refusal versus invented fake behavior | BUG-343's Stripe test-mode receipt disproved the old terminal-Session error assumptions. The corrected fake now refuses non-open Sessions (`src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts:429-470`); the added contract does not prove every hosted-completion interleaving. |
| A mocked SDK versus deployed error handling | `vitest.browser.setup.ts:24-26` stubs Sentry. BUG-319's deployed Server Action failure needed an SDK/deployment-path check beyond that browser suite. |
| Guard coverage versus guard existence | DEBT-519 found exported fakes the fidelity scanner never discovered. BUG-338 tested contact text while its destination was unusable. These are missing coverage/destination checks, not vendor outages. |

Match the proof to the changed boundary: pooled timeouts, provider contracts, production-only branches or delivery to the operator. Keep the fake contracts, real-Postgres lanes and separate observational hosted-Stripe lane.

### Finding 3: Recovery Needs Coverage, Progress and a Budget of Its Own

- Reconcile's all-pages loop restarts at offset zero and checks its 40-second budget only between pages (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:120-152`). The cron has a 60-second duration, bounds subscription requests separately, and leaves customer cleanup on the SDK defaults (`app/api/cron/reconcile-stripe-subscriptions/route.ts:11-22,94-112`). DEBT-501 item 1 already describes the starvation and timeout exposure. Separate `try` blocks fixed BUG-262's thrown-error coupling; they do not reserve invocation time for cleanup after slow reconciliation.
- Recovery is also incomplete when the operation exists but cannot be invoked. DEBT-414 F23 identifies the wired `RequeueRenewalNoticeDeliveryUseCase` with no operator entry point. ADR-027 requires confirmation before resending an unknown outcome; the planned script must preserve that boundary.
- Monitoring shares an invocation with business work. The renewal job checks the drill and GitHub schedules before selecting notices (`src/adapters/jobs/send-due-renewal-notices.ts:368-423`). The gateway reads GitHub sequentially, with a five-second timeout per read (`src/adapters/gateways/github-scheduled-workflows.ts:13,86-100,145-175`). Include that time in the baseline.
- #1545 has shipped, promoted by #1546. The renewal job now checks the release and advisory watches for a successful **scheduled** run within a day; a manual run does not count, and a rerun retains the original creation time (`scheduled-checks.ts:158-184`; `github-scheduled-workflows.ts:131-139`). The alert watcher's separate window is three days. GitHub unavailability is deliberately logged rather than alerted; persistent unavailability remains a documented blind spot (`scheduled-checks.ts:102-144`).

DEBT-501, DEBT-414 F23, DEBT-505 and DEBT-523 need coverage, retry/requeue paths, progress evidence and independent failure detection. Shared orchestration alone supplies none of these.

### Finding 4: Shared Test Resources and External Dependencies Are Different Problems

- DEBT-508 isolates Stripe ownership per CI run attempt and per local clone, not per local run. Runs in one clone still share its customer and database. The Clerk development instance and test user remain shared. A user per run could isolate session state, but would not create a new instance-wide API allowance or prove that BUG-333/BUG-337 disappear. Keep DEBT-508's overlap verification and existing coordination until evidence supports changing them.
- BUG-333 does not establish a Clerk JS release as the onset cause. Its cookie-setting behavior existed in the versions compared, and DEBT-521 distinguishes unpinned delivery from proof of a regression. BUG-333 and BUG-337 reproduced without overlapping E2E runs; overlap is not their established cause. BUG-306 and BUG-330 also separate observed session loss from unproven causes.
- BUG-341 was inherited `GIT_DIR` in a linked-worktree hook contaminating a test's `git init`, not the worktree being inside its clone. Moving it outside would not sanitize that environment. DEBT-514's exclusive worktree ownership addresses shared staging; BUG-341's environment-isolated subprocesses address the separate defect. BUG-329 concerns clone-local test infrastructure.
- DEBT-445 separately records shared Preview database/migration-ledger exposure. Its owner-enabled preview-branch isolation remains a separate requirement; per-run Clerk users or Stripe metadata namespaces do not isolate database schemas.
- Hosted Stripe labels (BUG-340), Codecov delivery (DEBT-510), registry availability (DEBT-516), and GitHub push/schedule delivery (DEBT-523) need their own contracts or recovery. BUG-336, BUG-339 and BUG-342 are test/tooling defects, not evidence that shared identity causes the entire group.

### Finding 5: Process Cost Is Real, but Its Controls Have Different Purposes

- The snapshot has ten scheduled workflow files and two Vercel crons. Release and advisory watches detect missing work; the alert watcher detects failures outside Sentry. BUG-335, BUG-339, BUG-341, BUG-344, DEBT-510, DEBT-514, DEBT-515, DEBT-518 and DEBT-519 document maintenance costs. Their history supplies no measured relationship between script size and review throughput.
- **DEBT-515 is decided.** On 2026-10-16 the owner declined a separate agent account. ADR-024's amendment makes the controls permanent: agents never request learnings; unexpected learnings are linked from the PR description; new learnings wait 30 days for the owner and appear in a weekly issue. #1547 recorded the decision, promoted in #1548. No account decision remains pending.
- DEBT-518 owns review capacity and documentation upkeep. DEBT-512 calls for reevaluating timing and logging after the hosting upgrade. Longer retention alone cannot detect a stopped schedule, missing deployment, expired read token or Sentry failure. AUDIT-015 requires detection outside Sentry. A replacement control must prove equivalent detection before retiring the old one.
- Closure needs each record's evidence. BUG-320 treats a quiet production window as limited evidence; BUG-323 requires positive execution proof, and DEBT-505 requires alert delivery. Preserve those distinctions and dated checks when changing closure rules.

### Finding 6: Performance Work Can Start with Measurement

- **Function and database regions.** On 2026-10-16, production's `x-vercel-id` response header showed functions in `iad1`, and its pooled database hostname showed `us-east-1`.
- **Locks have different scopes.** Subscription locks use the user, Stripe event locks use the event, practice creation takes shared question-row locks, and content writers serialize on the shared release pointer (`subscription-write-lock.ts:6-23`; `stripe-webhook-controller.ts:569-579`; `drizzle-practice-session-repository.ts:624-639`; `scripts/content-release/release-activation.ts:106-113`). The billing paths read vendor state before write transactions; selected cleanup queries use `SKIP LOCKED`. BUG-345 removes the assumed pooled timeout backstop.
- **Connection limits are per instance.** `lib/db.ts:19-22` limits one postgres.js pool to ten clients. Service-wide demand still needs measurement: include queue/pool pressure as well as query time. DEBT-447 accepted this pool size and deferred capacity changes.
- **Instrumentation already exists.** `lib/sentry-data-collection.ts:399` samples server traces at 5%; `src/adapters/shared/server-tracing.ts:7-26,68-105` defines action spans and allowed custom attributes. DEBT-450 names Sentry/Neon measurements and the bookmark census. Assemble a representative baseline from them. Browser field measurement and Web Analytics remain deferred under DEBT-479 and DEBT-464. BUG-331's trace/privacy decision precedes expanded collection; the custom attribute allowlist does not cover every SDK span.
- **Dynamic work does not imply rerendering all cached content.** The root reads the nonce (`app/layout.tsx:72`), while marketing components use `use cache` (`components/marketing/marketing-layout.tsx:25,55,73`; `marketing-home.tsx:71,93,135,182,253`). DEBT-420 accepted report-only CSP; DEBT-522 accepted `partialPrefetching: false`, its Next upgrade trigger and a nonce reconsideration only near the hosting allowance. Preserve those decisions while measuring actual request/render work.
- **Scoring has changed since DEBT-450.** `GetUserStatsUseCase` requests lifetime count and score plus bounded recent metrics (`src/application/use-cases/get-user-stats.ts:110-124`); `scoreByUserId` joins questions, sessions, question state and corrected revisions (`src/adapters/repositories/drizzle-attempt-repository.ts:383-428`). A new baseline must use this ADR-022 query shape, not the old two-count description. DEBT-450 Part 4 rejected rollup/cache without its trigger and chose consolidation only after measurement. It does not require deciding on a rollup before a performance pass. DEBT-349 likewise needs both a measured bottleneck and a content-invalidation path.

## Impact

Separate caller fixes can leave billing rules, historical terms and recovery coverage inconsistent. Tests miss defects when their environment or fake omits the relevant boundary. Shared test resources and external delivery failures consume review and release time.

## Options

1. **Follow existing plans without a separate extraction.** This minimizes immediate change. Each billing change must cover its writers, stored facts and recovery paths.
2. **Share subscription observation rules as the billing work needs them** (recommended). Preserve each caller's evidence and permissions. Add tests of deployed paths and recovery coverage alongside the extraction. This reduces duplication while Stripe retains control of its lifecycle.
3. **Have the application create subscriptions** after setup-mode Checkout (BUG-343 option 8). This changes the hosted-completion race, purchase UX, disclosures and consent under DEBT-414. It needs a larger product decision; current pre-sale fixes can proceed without it.

Test-resource isolation, measured process simplification and a performance baseline can proceed independently under their owning records.

## Resolution (proposed; the owner decides)

1. **Fix BUG-345 independently.** Prove the fix through a transaction pooler and decide migration bounds explicitly. Runtime startup options do not configure the build's separate migration client.
2. **Define shared billing rules before extracting them.** Specify fact authority, version fences, deletion lock order and each caller's consent/cancellation permissions. Amend ADR-014/ADR-027 if behavior changes. Distinguish ADR-002's local one-row invariant from correcting Stripe duplicates. Share observation and persistence policy where needed; keep SDK normalization and retries in adapters. Preserve different side effects. Any broader import guard needs a demonstrated rule to protect.
3. **Keep the pre-sale order and gates.** DEBT-501 item 2's stored terms and BUG-343 option 4 can add shared rules incrementally, touching only the callers they need. No separate refactor is a release prerequisite. DEBT-501 item 3 retains AUDIT-015's trigger. Preserve DEBT-414's evidence and owner decisions.
4. **Give recovery coverage and time.** Under DEBT-501, cover missing local subscriptions, fair progress across existing rows and cleanup time. A `stripe_customers` scan still misses absent customer mappings; name that residual and its evidence source. Keep duplicate correction/compensation under BUG-343. Deliver DEBT-414 F23's requeue path by its existing deadline. Alerts complement these mechanisms.
5. **Keep identity's deadline** unless the owner brings it forward. DEBT-502 supplies the resolver; DEBT-511 supplies verified notice destinations. Preserve ADR-004's identity rules and defensive retries. Adding `user.created` also needs explicit request fallback and deletion behavior; request concurrency remains.
6. **Prove each changed boundary** in its record: BUG-345's pooled check, BUG-321/BUG-343's real Stripe contract, BUG-319/BUG-323's deployed paths, and DEBT-519's discovery coverage. Evaluate per-run Clerk users under DEBT-508 alongside instance limits and session-loss controls. Keep exclusive worktrees and sanitized subprocess environments as separate measures.
7. **Build the performance baseline now.** Measure route/query latency, transaction/lock and pool waits, recovery progress and representative cardinalities; decide retention. Use existing instrumentation subject to BUG-331's decision. Rendering, scoring, caching and index changes follow their existing triggers and current query plans.
8. **Review process changes under DEBT-518 and DEBT-512.** Retire a check with equivalent evidence or explicit owner acceptance of the remaining risk. Pro alone does not replace independent alert/schedule detection. Positive-verification obligations still require positive evidence.

Existing plans, deadlines and authorization remain in force.

## Verification

- [x] First branch challenge on 2026-10-16; its corrections are retained where supported.
- [x] Further challenge against the dev snapshot above, the intervening diff, all Active records and relevant historical decisions; corrected unsupported counts/causes and added deployment-boundary, durable-fact and recovery-budget findings.
- [x] BUG-345 re-observed on Neon dev using only `SHOW` inside `sql.begin("read only")`.
- [x] On 2026-10-17, incorporated the second review's corrections and #1547/#1548. Retained the initial reviewer's 2026-10-16 production timeout and region observations; no new production connection or credential read.
- [ ] Owner decides whether to adopt the narrow billing seam and additions to the existing records. No new release gate is adopted by this assessment alone.
- [ ] Before closure, place each adopted action in its record: billing/recovery in DEBT-501 and BUG-343; identity/notices in DEBT-502/DEBT-511/DEBT-414; tests in their defect records and DEBT-508/DEBT-519; performance in the existing measurement-triggered work; process in DEBT-518/DEBT-512. Record declined proposals as decisions.
