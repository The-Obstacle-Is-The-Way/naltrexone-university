# DEBT-524: Fixing the Open Records One by One Leaves Their Shared Causes in Place

**Status:** Open — assessment; the owner decides the proposed order, which starts with DEBT-502's identity resolver
**Priority:** P2
**Date:** 2026-10-16

---

## Summary

The owner asked whether the open bug and debt records hide a deeper problem in the architecture, the coupling or the wiring. If they do, it should be fixed before the records are fixed one by one, and before a later pass on performance and concurrency.

**The answer is a qualified green light.**
- **Most of the architecture is sound.**
  - The layers hold, and the domain is pure.
  - Errors have one projection. Retry, rate limiting and idempotency each have one primitive.
  - No vendor call runs inside a transaction, and every lock is per user and transaction-scoped.
  - The practice, question and content code has no open record. The product-logic and UI families of records faded after June.
- **Nothing blocks the performance pass.** Its findings are local tuning, plus three choices to settle first (Finding 4).
- **Billing and identity have no owner,** and that is where records keep coming back (Finding 1). Each fix so far has added a retry, a writer or a check for the interleaving someone found. That will continue until one module owns each piece of that state and its invariants are written down. This is the one thing to fix first, before any more billing or identity patches.
- **The delivery system produces records of its own** (Findings 2 and 3). Shared test identities and clones make runs collide, and the process machinery is now about as large as the product.

The assessment also found a defect: the database timeouts the app sets do not apply through Neon's pooler (Finding 4).

## How This Was Assessed

All of this was done on `dev` at `78ebccc0`:
- every open record, read in full, apart from DEBT-414's legal detail;
- the 809 closed bug and debt records in the ledger, classified by root cause. About 25 were read in full. Recurrence is how often a later record cites an earlier one of the same family;
- three read-only code audits: who writes each identity and billing table, and from where; modularity and coupling; and readiness for performance and concurrency;
- two live checks: the region production's functions run in, read from the `x-vercel-id` response header; and the timeouts a pooled Neon connection reports.

One reviewer classified the records, mostly from their titles. The counts are approximate; the ranking of the families is the finding.

## Evidence

### Finding 1: Billing and Identity State Has No Owner

**The history.** The ledger and the index hold 846 records, closed and open.
- About 89 are about keeping identity and billing state in step across Clerk, Stripe and Postgres.
- About 89 are races or idempotency defects. 23 records are in both families.
- These two families recur the most: about 81% of their records since June cite an earlier record of the same family.

Four chains of records show it:
- **Duplicate subscriptions:** BUG-026, BUG-047, BUG-101, BUG-245 ("defeats every duplicate-subscription guard"), BUG-263, and now BUG-343.
- **User provisioning:** BUG-147, BUG-284, BUG-320 and BUG-332.
  - BUG-320 found that an earlier "verified race-free" note covered a different race.
  - BUG-332 found that BUG-320's retry did not cover three concurrent requests.
- **Webhook against reconcile:** BUG-242, BUG-243 and BUG-287. BUG-244 found that the reconcile had never run.
- **Deletion and its writers:** BUG-262, BUG-286, BUG-294 ("a fourth subscription writer") and BUG-296.

Seven open records belong to this family: BUG-320, BUG-321, BUG-332, BUG-343, DEBT-501, DEBT-502 and DEBT-511. DEBT-414's F22 and F23 touch it.

**Identity has two paths and no owner.** Each point below was read in the code.
- **Only a request creates a `users` row.** The Clerk webhook ignores `user.created` (`processClerkWebhook`).
  - Any render that reads auth state can provision the row, through `getRequestAuthState`. That includes the app layout, the pricing page, the billing page, and `AuthNav` on every marketing page.
  - A new user's first visit therefore sends several requests that can each try to create the row.
- **The two paths lock differently.**
  - The request path checks the deletion tombstone in a separate read, with no lock (`clerk-auth-gateway.ts`).
  - The webhook takes the tombstone lock and checks again.
  - Each path has its own email selector, and both fall back to an unverified first address.
- **The email is held three times,** by Clerk, by `users.email` and by the Stripe customer, and nothing keeps the copies in step.
  - AUDIT-015 named this on 2026-10-08 and decided on one identity resolver (DEBT-502). It is not built, and the plan places it 35 days before the earliest live renewal.
  - Meanwhile BUG-320 and BUG-332 were fixed with retries on the path the resolver will replace, as both records say.

**Subscriptions have one write site, but nothing owns what surrounds it.** Each point below was read in the code.
- **What is sound.** Every writer reaches `stripe_subscriptions` through one upsert, after a fresh Stripe read. The upsert takes a per-user advisory lock, a version fence and the domain's write guard.
- **What is not owned.** Each of the four callers decides what happens around that write, and they differ:
  - the webhook maps the customer, records consent, marks termination, alerts on a competing subscription and sweeps open Sessions;
  - the success page maps the customer only;
  - the reconcile maps the customer even when the write is refused, marks termination, alerts and cancels duplicates;
  - BUG-321's sync writes the row only.
- **The success page bypasses the shared Stripe path.** It parses the raw Stripe objects itself, in `app/` (`checkout-success-sync.tsx`). It also calls the SDK without the circuit breaker that every other Stripe call goes through.
- **Billing policy lives in adapters.**
  - The blocking statuses are defined twice, in the Checkout gateway and in the reconcile job, and neither definition is in the domain.
  - `stripe-checkout-sessions.ts` is 1,495 lines and makes 11 Stripe calls.
  - The webhook controller is 902 lines. It opens 12 transactions and builds use cases inline.
- **No decision record states the model.**
  - The lock order is written only in a code comment, which counts the writers: "BUG-321's sync on a refused checkout is the fifth" (`subscription-write-lock.ts`).
  - ADR-014 accepts duplicated sync logic that "must remain consistent".

**What the model cannot see.**
- **A subscription we never recorded is never found.** The reconcile walks only the rows we already have (`listLocalSubscriptions`). BUG-321's fix added a sync at request time instead.
- **A second live subscription has nowhere to go.** `stripe_subscriptions` is unique on `user_id`, so the write guard drops the second one silently (BUG-343).
- **The plan is not stored.** Every read derives it from today's price IDs (DEBT-501 item 2).

**The layers meant to hold this are thin.** The domain and application layers are 9,343 of 57,305 production lines, about a sixth. Adapters are 17,746 lines and `app/` 19,862.

### Finding 2: Test Environments Are Shared, and Coordination Stands In for Isolation

- **About a third of the open records concern tests, CI or the shared clones, not the product:** BUG-329, BUG-333, BUG-336, BUG-337, BUG-339, BUG-340, BUG-341, BUG-342, DEBT-508, DEBT-510, DEBT-514, DEBT-516 and DEBT-523.
- **The chain that recurs** is E2E's shared Clerk session: BUG-306 and BUG-330 are closed; BUG-333, BUG-337 and DEBT-508 are open.
- **What is shared.**
  - Every E2E run, local or CI, signs in as one Clerk user on one development instance, and uses one Stripe test customer (DEBT-508).
  - Preview deployments share one database and one migration ledger (DEBT-445).
  - Several sessions work in one clone at once. A pre-commit hook can then stage another session's work (DEBT-514), and a test run from a worktree can mark the clone bare (BUG-341).
- **What stands in for isolation.** Sessions message each other before any E2E run, push or CI dispatch, and they refuse E2E while any CI run is active. DEBT-508 calls this "coordination standing in for isolation". Every session pays for it in waiting, and the cost grows with each session added.

### Finding 3: The Process Machinery Is About as Large as the Product

- **Size, in lines.**
  - Production: 57,305 lines, with `components/` included.
  - Process scripts (merge guard, promotion, records, review, watchers), with their tests: 12,481.
  - Repository-policy tests and their scanners: 10,383.
  - `docs/` Markdown: 2.10 MB, against 1.74 MB of production source.
  - The texts of the closed records total 6.4 MB. Their median size grew from about 2.5 KB in February and March to about 10 KB since April.
- **Machinery that watches machinery.**
  - There are ten scheduled workflows and two crons, and several of them watch the others: the alert watcher, the renewal job that checks the watcher, the release watch (DEBT-523), and the advisory watch.
  - An alarm on those watches is in review today.
  - BUG-344 was a defect in one of them.
  - Some of these exist because the Hobby plan keeps runtime logs for one hour and offers no log drains (DEBT-505, DEBT-512).
- **Its share of the records is rising.** The process and tooling family is about 4% of all records, but about a fifth of those closed in October or still open: BUG-335, BUG-339, BUG-341, BUG-344, DEBT-515, DEBT-518, DEBT-519, DEBT-520 and DEBT-523.
- **It sets the pace of every change.**
  - Every change spends one CodeRabbit review. Reviews come one an hour, shared by every session and a second repository, and a promotion follows each change.
  - DEBT-518 found that 96% of the pull requests it measured edited a record or the index.
  - A record whose fix leaves it Verifying needs another pull request, review and promotion to close.
- **What it buys.** It has caught real defects. Second-agent challenges and reviews overturned designs before they shipped: DEBT-503 item 5, BUG-320's narrowing, and BUG-343's two audits. So the question is proportion, not whether to keep the rigor.

### Finding 4: Readiness for Performance and Concurrency

Nothing found needs restructuring before a performance pass. These points were read in the code or checked live:
- **Steady-state requests make no Clerk call.** The session token is verified locally with `jwtKey`, and an existing user costs two database round-trips. A signed-out visit to pricing reads no database.
- **Locking is safe.**
  - Locks are per user and transaction-scoped.
  - No vendor call runs inside a transaction.
  - Indexes match the hot predicates.
  - Prunes use `SKIP LOCKED`.
- **The regions match.** Production's functions run in `iad1` (`x-vercel-id`). The Neon `dev` branch's host is in `us-east-1`; production's region is inferred from the same project.

Three choices are worth settling first, because later work builds on each.
1. **There is nothing to measure against.**
   - Runtime logs last one hour, nothing forwards pino's output, and browser measurement and Web Analytics are off (DEBT-479, DEBT-464).
   - The Waiting rows on performance (DEBT-450, DEBT-349) and DEBT-503 item 4 wait for numbers that nothing collects.
   - Production checks in Verifying records rest on the absence of Sentry events, at traffic too low to produce one. BUG-320 says so of its own check.
   - A performance pass first needs a baseline, with retention: per-route latency and database time.
   - More tracing reopens BUG-331's privacy question. Spans are scrubbed against a list of credential parameters, so their attributes should be allowed by name before the sample rate rises.
2. **Every page renders per request.**
   - The root layout reads the CSP nonce from `headers()`. So every route, marketing pages included, re-renders its tree in a function on every request.
   - The nonce serves a policy that only reports (`content-security-policy-report-only` in production, after DEBT-420).
   - This should be kept or dropped deliberately, together with DEBT-522's Waiting row, before caching work assumes either answer.
3. **Lifetime scores are computed when they are read.**
   - Every dashboard load runs a lifetime five-way join, including the answer-key-correction subquery (`scoreByUserId`), and ADR-022's rules add to it.
   - Whether scores stay computed on read or become a maintained rollup is easier to decide before more scoring rules arrive (DEBT-450 Part 4).

**The defect: the database timeouts do not apply through the pooler.**
- **What the code sets.** `lib/db-connection-options.ts` sets these as connection startup parameters:
  - `statement_timeout` 30s;
  - `lock_timeout` 5s;
  - `idle_in_transaction_session_timeout` 60s.
- **What a pooled connection reports.** Neon's pooler drops startup parameters. On 2026-10-16, a pooled connection to the Neon `dev` branch, opened with those options, reported `statement_timeout` 0, `lock_timeout` 0 and `idle_in_transaction_session_timeout` 5min.
- **Production.** It uses a pooled host too, which dropped `default_transaction_read_only` the same way on 2026-10-11. So production most likely runs with no statement or lock timeout, and a lock wait under contention has no bound.
- **Why the tests pass.** The integration test proves these options against direct local Postgres only.
- **The fix.** Set them at the role (`ALTER ROLE … SET`), and check them through the pooled URL.

## Impact

- **Billing and identity, fixed record by record.** The history says the next interleaving arrives as a new record. Each fix adds a writer, a retry or a check, so the code that must stay consistent keeps growing. Those paths start handling money at the first live sale.
- **Shared test environments.** They turn flakes into records, re-runs and held production deploys, and the cost rises with each session working in parallel.
- **Process weight.** The hourly review and the promotion after each change cap how many of the open records can close in a week, whatever their size.
- **No baseline.** A performance pass would tune by guesswork, and production checks in Verifying records prove little.

## Options

1. **Keep fixing the records one by one, in today's order.** Cheapest now. Finding 1's history says billing and identity will keep producing records.
2. **Make the app the only creator of subscriptions** (BUG-343 option 8): a setup-mode Checkout, then the server creates the subscription. This ends the race on Stripe's hosted page. But it changes the purchase page, the disclosures and the consent flow (DEBT-414), before the first live sale. It is too large to be a prerequisite.
3. **Give billing and identity owners in the application layer, then fix the records on top of them** (recommended). It is incremental, and each step ships as its own pull request.
4. **Also isolate test runs and lighten the process** (Findings 2 and 3), each where it pays.

## Resolution (proposed; the owner decides)

**Fix first, before any other billing or identity patch:**
1. **The identity resolver.** This is DEBT-502's decision, brought forward from "35 days before the earliest live renewal". One module is the only writer of `users`, and both the webhook and the request path call it. It:
   - provisions in one short transaction under the tombstone lock (DEBT-502 item 2), so concurrent first requests wait instead of racing;
   - takes only Clerk's verified primary email (item 3);
   - moves a stale owner's row (item 1);
   - pushes the address to the Stripe customer (DEBT-511 item 5).

   Optionally it also handles `user.created`, so that renders rarely write. BUG-320's and BUG-332's retries then guard a path that no longer races, and DEBT-511 builds on the resolver as planned.
2. **One service in the application layer for subscription observations.**
   - All four writers call it. It owns the upsert, the customer mapping, consent termination and the duplicate alert.
   - The success page goes through the gateway's normalizer and the Stripe retry wrapper.
   - Billing policy, such as the blocking statuses and trial eligibility, is defined once, in the domain.
   - BUG-343's option 4 and DEBT-501 item 2's recorded plan are built on it, not beside it.
3. **An ADR for the ownership of billing and identity.** It names which system owns which fact, the one writer of each table and the lock order. It also states the invariants:
   - at most one live subscription per customer;
   - the stored row is Stripe's canonical one;
   - the plan is a recorded fact.
4. **Check those invariants continuously.**
   - The reconcile walks Stripe customers from `stripe_customers`, oldest attempt first (DEBT-501 item 1's design).
   - It checks each invariant, and alerts on drift through DEBT-505's path.
   - "Stripe has it and we don't" then becomes visible (BUG-321's residual, DEBT-501 items 1 and 3). BUG-343's duplicate becomes detected, though not impossible.

**Before adding parallel sessions or CI lanes:**

5. **Isolate each run and each session.** A Clerk test user and a Stripe test customer per E2E run (DEBT-508), and a worktree per session (DEBT-514's safeguard).

**Before the performance pass:**

6. **A latency baseline with retention,** with span attributes allowed by name first (BUG-331).
7. **Decide the two structural choices:** the per-request root (with DEBT-522) and scoring at read time (DEBT-450 Part 4).
8. **Fix the pooler timeouts.**

**The owner decides alongside:**

9. **Proportion in the process.**
   - A check that only waits for no error, at traffic too low to produce one, closes the record at promotion instead of holding it in Verifying.
   - Vercel Pro (DEBT-512), at or before the first live sale, then retires the watchers its log retention and drains make redundant.
   - More CodeRabbit capacity is DEBT-518's open decision.

**Proceed now, unchanged:** every other open record, since none depends on the items above. BUG-321's provider-contract test also proceeds.

## Verification

- [ ] A second agent challenges this record on its branch.
- [ ] The owner decides whether items 1 to 4 come first, and which of items 5 to 9 to adopt.
- [ ] Each adopted item has a home before this record closes:
  - items 1, 2 and 4 in DEBT-502 and DEBT-501;
  - item 3 as an ADR;
  - items 5 to 7 in DEBT-508, DEBT-514, BUG-331, DEBT-522 and DEBT-450;
  - item 8 as a bug record or a one-PR fix.
- [ ] Six months after items 1 to 4 ship, re-measure the new billing and identity records per month against this record's history.

## Related

- **Finding 1:** DEBT-502 (the identity resolver), DEBT-501, DEBT-511, BUG-320, BUG-321, BUG-332, BUG-343, and AUDIT-015 (closed), whose order this changes.
- **Finding 2:** DEBT-508, DEBT-514, BUG-333, BUG-337 and BUG-341.
- **Finding 3:** DEBT-515, DEBT-518 and DEBT-523.
- **Finding 4:** DEBT-349, DEBT-450, DEBT-479, DEBT-512, DEBT-522 and BUG-331.
