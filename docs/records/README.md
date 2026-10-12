# Records

Open bug and debt records, one file each: `bug-NNN-slug.md` and `debt-NNN-slug.md`. A closed record is deleted and leaves one line in [the ledger](./closed.md). [How records work](#how-records-work) is at the end.

**Now** — 2026-10-12.
- **Verifying, by due date.** BUG-319 and BUG-323 10-19; BUG-320, BUG-325 and BUG-327 10-20; BUG-331, BUG-332, DEBT-508 and DEBT-510 10-22; DEBT-515 10-23; DEBT-516 10-24; BUG-336 10-26; DEBT-505 11-05. Each record names its check.
- **In progress.** DEBT-518, the documentation revamp: these records and the ledger first, then the agent instructions, the layout, and the archive's removal last.
- **Next.** BUG-337's investigation, with BUG-333's reopened loss, due 2026-10-14. DEBT-503 item 4, due 2026-10-21. Alert kinds for the silent conditions (DEBT-503 item 3, DEBT-501 items 1 and 2). BUG-321's provider-contract test. DEBT-519, then DEBT-520.
- **Before the first live sale.** Vercel Pro (DEBT-512), the live purchase and refund (DEBT-501 item 7), the tax decision (DEBT-414 Q7), the legacy price-ID list (DEBT-501 item 2), the add-card recheck (DEBT-501 item 4, DEBT-414 F22). Then counsel's Q1–Q6 (DEBT-414). By 35 days before the first live renewal: the identity resolver (DEBT-502) and DEBT-511 on it.
- **Held.** DEBT-514 holds lint-staged at 17.5.1.
- **Owner decisions pending.** Skew Protection (BUG-319); the server's 5% trace sample (BUG-331); a production check for E592 (BUG-334); reporting Clerk JS's cookie race (BUG-333); Clerk's verified-email setting (DEBT-502); DEBT-414's open items; the production content bootstrap (DEBT-483); the learnings backlog (DEBT-515).

## Active

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md) | Subscribe and add-card fail for a page loaded before a deploy | P2 | Verifying — the Sentry checks, and a real-SDK test that the stale-action event reaches Sentry; due 2026-10-19 |
| [BUG-320](./bug-320-first-pricing-render-user-upsert-race.md) | A new user's first visit can fail when two requests create their row at once | P2 | Verifying — no `User could not be upserted` error in Sentry for two weeks after the deploy; due 2026-10-20 |
| [BUG-321](./bug-321-already-subscribed-answer-discarded.md) | Stripe's "already subscribed" answer is discarded for signed-in users | P2 | In Progress — the fix is in production; a provider-contract test of the refused checkout's Stripe list and sync remains |
| [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md) | Anonymous requests can spend Clerk's shared Backend API limit | P1 | Verifying — owner confirms the production limiter writes its rows; due 2026-10-19 |
| [BUG-325](./bug-325-malformed-requests-throw-and-write-oversized-logs.md) | Malformed anonymous requests make our code throw and write oversized error logs | P3 | Verifying — no Sentry event from the fixed paths for two weeks after the deploy; due 2026-10-20 |
| [BUG-327](./bug-327-dependabot-branches-build-with-preview-secrets.md) | Dependabot branches are built on Vercel with Preview secrets | P3 | Verifying — no Dependabot head deploys; a Dependabot merge through the tooling remains; due 2026-10-20 |
| [BUG-329](./bug-329-local-test-target-changes-in-child-commands.md) | Long clone names change the local test target in child commands | P4 | Open — canonicalize generated instance names before passing them to child commands |
| [BUG-331](./bug-331-server-breadcrumbs-and-request-spans-carry-credentials.md) | Server breadcrumbs and request spans carry credentials the scrubbers miss | P2 | Verifying — a production server error shows no breadcrumbs, and a sampled request span shows its credential parameters filtered; due 2026-10-22 |
| [BUG-332](./bug-332-concurrent-first-requests-can-deadlock-provisioning.md) | A new user's concurrent first requests can deadlock provisioning | P2 | Verifying — no "Failed to ensure user row" event in Sentry for two weeks after the deploy; due 2026-10-22 |
| [BUG-333](./bug-333-signed-in-e2e-test-loses-its-clerk-session-mid-run.md) | A signed-in E2E test loses its Clerk session when it navigates during Clerk JS's cookie rewrite | P3 | Open — a 2026-10-12 loss, with the echo dropped, names another cause; investigated with BUG-337; due 2026-10-14 |
| [BUG-334](./bug-334-nextjs-logs-e592-when-e2e-opens-a-question.md) | Next.js logs invariant E592 when E2E opens a question | P3 | Open — upstream Next.js bug (vercel/next.js#99500); no failed request found; the owner's production check and the Next.js fix remain |
| [BUG-336](./bug-336-local-e2e-cleanup-gives-up-on-a-slow-process-listing.md) | Local E2E cleanup gives up on a slow process listing and leaves Playwright's web server running | P3 | Verifying — promotion to `main`, and two weeks of CI after the merge without `spawnSync ps ETIMEDOUT`; due 2026-10-26 |
| [BUG-337](./bug-337-session-first-question-can-fail-to-fetch.md) | A session's first question can fail to load with "Failed to fetch" | P3 | Open — a server action carrying the dev-browser cookie was signed out as dev-browser-missing; log the server's view to explain it; due 2026-10-14 |
| [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) | Public legal pages, renewal consent, and security-program closure | P1 | Open — engineering has F21 and F22 left; the rest waits on the owner, counsel and a tax adviser |
| [DEBT-500](./debt-500-vitest-5-coordinated-migration.md) | Vitest 5 needs a coordinated migration | P3 | Open — the grouped Dependabot PR #1451 is the migration vehicle; resolution decided in the record |
| [DEBT-501](./debt-501-billing-operations-resilience.md) | Billing operations can leave payers without access as the service grows or changes | P2 | Open — quick wins and item 1's stopped-early alert released; next, the pre-sale items |
| [DEBT-502](./debt-502-account-identity-and-action-hardening.md) | Rare account states can lock a person out, and payment actions expose test seams | P3 | Open — decided per item |
| [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) | Clerk's shared Backend API allowance is a single point of failure | P2 | In Progress — items 1, 3 and 5 released, item 5's key set in production 2026-10-11 and its deploy check corrected the same day; item 4 due 2026-10-21; item 2 waits for its trigger |
| [DEBT-504](./debt-504-duplicate-request-correlation.md) | Request correlation duplicates the hosting platform | P4 | Open — remove the request-ID helper and the per-call logger option; keep the Logger port in controller dependencies |
| [DEBT-505](./debt-505-logged-only-failures-alert-nobody.md) | Failures that are only logged alert nobody | P2 | Verifying — released 2026-10-09; the first drill and the cron monitor are proven. Still open: its unchecked items, among them the 2026-11-03 cycle's drill; due 2026-11-05 |
| [DEBT-508](./debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md) | Concurrent E2E runs share one Clerk rate budget and one Stripe customer | P2 | Verifying — still to show: two overlapping CI runs both pass; in doubt, since a CI run overlapping a local run lost a Clerk session; due 2026-10-22 |
| [DEBT-509](./debt-509-pending-nextjs-security-fixes-have-no-watcher.md) | Pending Next.js security fixes have no watcher | P2 | Open — rule decided; the watcher covers every repository behind `pnpm-lock.yaml`, and its scheduled runs read them; waiting for `vite` 8.3.3 and the two pending Next.js fixes |
| [DEBT-510](./debt-510-codecov-drops-patch-notifications.md) | Codecov sometimes drops the patch notification after a successful upload | P3 | Verifying — over two weeks of PR heads, no merge is blocked by a dropped Codecov notification; due 2026-10-22 |
| [DEBT-511](./debt-511-legal-notices-use-a-stored-email-clerk-may-have-changed.md) | Legal notices go to a stored email that Clerk may have changed | P2 | Open — resolution decided below; built on DEBT-502's identity resolver, and due before 35 days ahead of the earliest live renewal |
| [DEBT-512](./debt-512-production-hosting-plan-forbids-commercial-use.md) | Production runs on a hosting plan whose terms forbid commercial use | P2 | Open — the owner keeps Hobby until the first live sale (decided 2026-10-09), then moves production to Vercel Pro |
| [DEBT-514](./debt-514-lint-staged-shared-clone-staging-race.md) | lint-staged can stage another session's work | P2 | Open — held at 17.5.1; safeguard or worktree isolation required |
| [DEBT-515](./debt-515-coderabbit-learns-rules-from-agents.md) | CodeRabbit learns lasting rules from agents speaking as the owner | P2 | Verifying — after promotion, the first weekly learnings issue opens and new learnings wait for approval; due 2026-10-23 |
| [DEBT-516](./debt-516-ci-database-image-depends-on-one-registry.md) | CI's database image depends on one registry | P3 | Verifying — CI pulls Postgres from the first of three registries serving its digest, and compose pins it too; after promotion, `main`'s CI logs which one served it; due 2026-10-24 |
| [DEBT-519](./debt-519-fake-contract-register-misses-adapter-owned-fakes.md) | The fake-contract register misses adapter-owned fakes | P3 | Open — make the register scan discover adapter-owned fakes, red first, then add `FakeStripePortalConfigurations` |
| [DEBT-520](./debt-520-repository-layout-trigger-has-fired.md) | ADR-013's repository-layout trigger has fired without a decision | P4 | Open — decide whether the repositories stay flat or move into aggregate folders, and record it as an ADR |
| [DEBT-518](./debt-518-closed-records-outweigh-the-code-and-bury-current-truth.md) | Closed records outweigh the code and bury current truth | P2 | In Progress — step 0's layout and the records move are in review; the agent instructions, the layout and the archive's removal follow |

## Waiting

Work that is not done, waiting for a trigger. Each row is self-contained; the ID is the closed record that holds its history, which [the ledger](./closed.md) resolves. When a trigger fires, file a new record or reopen the work in an Active one.

| ID | What waits | Priority | Revive when |
|----|------------|----------|-------------|
| DEBT-483 | Production content still seeds directly: no release is active. Bootstrapping adopts what is live as release one; after it the direct and managed seeds refuse production, and content changes only through releases (ADR-021). There is no supported undo. | P2 | The owner decides to bootstrap; run the practice QA guide first. Its prerequisites, DEBT-490 and DEBT-492, are released. |
| DEBT-483 | Once a database has an active release, the managed seed refuses it rather than staging a release. | P3 | A release is bootstrapped on any database the managed seed serves. |
| DEBT-483 | ADR-021's release zero waits for the content repository's own SPEC-007 to compute `stored-fields-json-v1`. (That SPEC-007 is not this repository's closed SPEC-007.) | P3 | The content repository ships it. |
| DEBT-465 | The practice and billing QA procedures in [the QA guides](../guides/qa/README.md) are Draft, each without two evidenced runs. | P3 | Run the practice procedure before the production content bootstrap, and the billing procedure with the first live purchase (DEBT-501 item 7). |
| DEBT-469 | `AGENTS.md` allows one retry for a browser-lane bootstrap failure (`no tests / 1 error` in about a second) whose root cause is unknown. | P3 | It reproduces: file a bug with the output. Or 2027-02-15 passes with no recurrence: delete the note. |
| DEBT-474 | Dependabot PRs run no E2E and get no credentials. PR-time E2E for them would need a separate Stripe Sandbox and Clerk instance; shared credentials stay prohibited, and metadata namespaces are not isolation. | P2 | Paying customers, or a second engineer. |
| DEBT-479 | Browser field measurement (LCP, CLS, INP), RUM, replay, profiling and source-map upload are off, and browser tracing is 0%. | P3 | The owner picks a source, quota and privacy policy, with the matching privacy-policy change and collection notice. |
| DEBT-464 | Web Analytics and its privacy notice are off; they need Vercel Pro. | P3 | The Pro move at the first live sale (DEBT-512), or earlier owner approval; then re-plan the activation and the notice. No purchase or activation is delegated by this row. |
| DEBT-460 | Two TypeScript packages, 7 and 6, stay in step until one can go. | P4 | TypeScript 7 has a stable compiler API and every compiler-API consumer is ported. |
| DEBT-445 | Preview deployments share one Neon database and migration ledger, and every pushed PR head migrates it. The build-time verifier only detects ledger drift. | P3 | Before relying on a schema-bearing Preview: the owner enables isolated preview branches in Vercel's Neon integration, with a non-production parent and its own ledger. |
| DEBT-450 | Finalize rewrite (Part 1), bookmark pagination (3b), dashboard aggregate consolidation (4), and duplicate latest-attempt ranking (5). | P3 | Part 1: a 30-second finalize timeout, or the sampled-finalize p95 and dominant-span evidence, plus Neon slow-query statement evidence. 3b: 500 bookmarks in the [read-only census](../dev/bookmark-cardinality-census.md), or the post-fix Sentry latency. Parts 4 and 5: their database latency share, plus the [sanitized EXPLAIN procedure](../dev/sanitized-explain-capture.md) before any index. |
| DEBT-449 | Automatic pruning of handled Clerk events. | P4 | Two consecutive monthly production censuses show at least 1,000,000 handled rows or 1 GiB of table and indexes, or Neon reports attributable impact. A prune must skip events with pending children. |
| DEBT-447 | A lock-wait bound for the migration session. | P3 | A proof that a supported setting reaches Drizzle Kit's migration transaction, or a Preview or Production migration waits 30 seconds or more for a lock. |
| DEBT-446 | No per-question freshness check in the seed: an older clone could overwrite newer same-slug content. | P3 | That happens, or a second content writer appears. It retires with the production content bootstrap, after which the direct seed refuses production. |
| DEBT-454 | Type-level enforcement that lock repositories run inside a transaction. | P4 | Review or the wiring tests find a real base-database lock call, or a sixth lock-capable consumer appears. |
| DEBT-349 | Cross-request caching of published question and tag reads. | P4 | Production metrics show those reads are a material cost, and a Next-runtime `revalidateTag` path exists for script-driven content updates. |
| BUG-330 | E2E carries Clerk's testing token in its setup context only. | P3 | A trace or a failed restore shows Clerk refusing a client for want of it; then carry it into every test context. |
| SPEC-017 | A Vercel custom firewall rule bounds Clerk-calling requests (live since 2026-10-05, BUG-323); the project's allowance and a response drill are unproven. | P3 | Unexpected invocation or Neon growth, or actionable Firewall events. |
| SPEC-017 | Optional rate-limit extensions: a Redis or request-entry limiter, IETF `RateLimit` headers, and controls for new large-payload endpoints. | P4 | Attributable limiter cost or latency, a multi-region need, the draft becoming an RFC, or a new expensive endpoint. |

Unscheduled product ideas are in [the ideas list](../product/ideas.md).

## How Records Work

- **When to file.** File a record for work that spans more than one pull request, or that needs an independent challenge before any code. A proven fix that lands in one pull request may use that PR's description as its record, with the same sections, unless a check outlives the PR: then it needs a record, so the weekly due check sees it.
- **Write first, challenge on the branch.** Commit the record first on the work branch and push the branch. A second agent challenges it there. A security finding an outsider could use stays local until its fix ships.
- **Edit in place.** When understanding changes, rewrite the text and add a one-line `Corrected YYYY-MM-DD: what changed` note, rather than appending dated sections. Keep receipts short: the pull requests, the promotion and each check's outcome. Run IDs and SHAs go in pull-request descriptions.
- **IDs.** `pnpm exec tsx scripts/next-record-id.ts bug` (or `debt`) prints the next free ID from these records, the ledger and the archive. The guard fails on a duplicate.
- **Ship it with its fix.** The record and its fix go up in one pull request, so one review covers both.
- **Statuses.** Open, In Progress, Blocked (needs an action outside the repository), or `Verifying — <the remaining check>; due YYYY-MM-DD`. A record is Verifying when its fix has merged and a check remains that only promotion or production can satisfy; the fixing PR sets that status itself. The status is one line of at most 200 characters; detail goes in the body. Priorities: P0 broken, data lost or a security hole open; P1 major function broken; P2 degraded with a workaround; P3 minor; P4 trivial.
- **Nothing overdue goes unseen.** A weekly job opens one GitHub issue for every Verifying record past its due date or more than 90 days out. Start each session by reading the Now stanza above.
- **Tracking.** A bug in shipped code stays open until its fix is promoted and any production proof is recorded. A branch-local defect still needs red-first proof, review and CI, and its record says it was branch-local.
- **Evidence.** A fix that deletes a pattern lands with the guard that keeps it deleted, and a guard lands with a red test for the state it rejects. A scheduled-only proof is not claimed until a hosted run has executed it.
- **Audits.** A sweep files each confirmed finding as its own record. Its method and coverage go in the pull request's description. A candidate found invalid closes with the source-level reason it cannot happen.
- **Links.** Only this index links records. Elsewhere, cite a record by its ID: the ledger resolves it, and a link would break when the record closes. Owner-adopted legal and security text keeps its links until the owner revises it.
- **Closing.** Once the last check is recorded, the next pull request that touches this folder:
  1. moves lasting knowledge home: a rule to `AGENTS.md` or `.claude/rules/`, a decision to an ADR, a reason to a code comment, and an unfinished tail to a Waiting row with its trigger;
  2. deletes the record and any asset folder;
  3. adds its ledger line in ID order: `ID · title · disposition · date · path · #PR · commit`, the commit being the last that held the record. The disposition is Resolved, Won't Fix, Invalidated, Superseded, Reclassified, Accepted or Decomposed, as the record shows; never relabel an invalidated record as fixed;
  4. removes its row, and updates Now.
- **Assets.** Records get no asset folders: screenshots and receipts go on the pull request. DEBT-414's folders predate this rule and go when it closes.
- **The archive.** `docs/_archive/` holds records closed before 2026-10-11 until DEBT-518 deletes it. It is not edited, apart from link maintenance.

**Template.** A bug record's heading is `# BUG-NNN: Short Title`; a debt record's is `# DEBT-NNN: Short Title`.

```markdown
# BUG-NNN: Short Title

**Status:** Open
**Priority:** P2
**Date:** YYYY-MM-DD

---

## Summary
## Evidence
## Impact
## Options
## Resolution (decided)
## Verification
- [ ] …
## Related
```
