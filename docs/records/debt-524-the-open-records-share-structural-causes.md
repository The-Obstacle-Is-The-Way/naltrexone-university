# DEBT-524: Fixing the Open Records One by One Leaves Their Shared Causes in Place

**Status:** Open — assessment; the owner decides the proposed order: BUG-345, then one owner for subscription writes before the pre-sale billing items
**Priority:** P2
**Date:** 2026-10-16

---

## Summary

The owner asked whether the open bug and debt records hide a deeper problem in the architecture, the coupling or the wiring. If they do, it should be fixed before the records are fixed one by one, and before a later pass on performance and concurrency.

**The answer is a qualified green light.**

**Most of the architecture is sound.**
- The layers hold, and the domain is pure.
- Errors have one projection.
- Request idempotency, retry and rate limiting each have one primitive.
- No vendor call runs inside a transaction, and every lock is per user and transaction-scoped.
- The practice and question code has no open record, and the product-logic and UI families of records faded after June.
- Nothing blocks the performance pass. Its findings are local tuning, plus two choices to settle first (Finding 4).

**Billing and identity are where records keep coming back** (Finding 1).
- Identity has two writers.
- Subscriptions have one fenced write, but nothing owns what surrounds it: each of four callers decides that for itself.
- Most fixes so far have added a retry, a writer or a check for the interleaving someone found. The history suggests this will continue until each piece of state has one owner and written invariants (inferred).
- The structural work to do first is on the subscription side, because those paths start handling money at the first live sale. It should come before the pre-sale billing items, which would otherwise each touch all four callers.

**The delivery system produces records of its own** (Findings 2 and 3).
- Tests and CI depend on one shared Clerk user and on vendors that change without notice.
- The process machinery is large next to the product.

**A defect.** The assessment found that the database timeouts the app sets do not apply through Neon's pooler. It is filed as BUG-345.

## How This Was Assessed

On 2026-10-16, on `dev` after #1540:
- every open record, read in full, apart from DEBT-414's legal detail;
- the 809 closed bug and debt records in the ledger, classified by root cause. About 25 were read in full. Recurrence is how often a later record cites an earlier one of the same family;
- three read-only code audits: who writes each identity and billing table, and from where; modularity and coupling; and readiness for performance and concurrency;
- two live checks: the region production's functions run in, read from the `x-vercel-id` response header; and the timeouts a pooled Neon connection reports (BUG-345).

A second agent challenged the first draft against the code and the records. Its corrections are folded in, and the most important one changed the proposed order.

One reviewer classified the records, mostly from their titles. The counts are approximate; the ranking of the families is the finding. The counts also partly measure where audits looked: most of October's billing and identity records came from the owner-requested hunt of 2026-10-05.

## Evidence

### Finding 1: Billing and Identity State Has No Single Owner

**The history.** The ledger and the index hold 846 records, closed and open.
- About 90 are about keeping identity and billing state in step across Clerk, Stripe and Postgres.
- About 90 are races or idempotency defects.
- About 25 records are in both families.
- These two families recur the most: about 81% of their records since June cite an earlier record of the same family.

Four chains of records show it:
- **Duplicate subscriptions:** BUG-026, BUG-047, BUG-101, BUG-245 ("defeats every duplicate-subscription guard"), BUG-263, and now BUG-343.
- **User provisioning:** BUG-147, BUG-284, BUG-320 and BUG-332.
  - BUG-320 found that an earlier "verified race-free" note covered a different race.
  - BUG-332 found that BUG-320's retry did not cover three concurrent requests.
- **Stale writes over newer state:** BUG-242 (a late webhook), BUG-243 (the success page), and BUG-286 and BUG-287 (the reconcile against the webhook). These stopped after the July fences.
- **Deletion and its writers:** BUG-262, BUG-294 ("a fourth subscription writer") and BUG-296.

Seven open records belong to this family: BUG-320, BUG-321, BUG-332, BUG-343, DEBT-501, DEBT-502 and DEBT-511. DEBT-414's F22 and F23 touch it.

**Identity has two writers and no owner.** Each point below was read in the code.
- **A request usually creates the `users` row.**
  - The Clerk webhook ignores `user.created`, although its `user.updated` upsert can insert a row.
  - On the request side, any code that reads the current user can provision the row: `getRequestAuthState`, which the app layout, the pricing page and `AuthNav` on every marketing page use, and `requireUser`, which the billing page and every signed-in action use.
  - A new user's first visit therefore sends several requests that can each try to create the row.
- **The two paths share the provisioner's conflict rules, but lock differently.**
  - The request path checks the deletion tombstone in a separate read, with no lock.
  - The webhook takes the tombstone lock, and checks again.
  - Each path has its own email selector, and both fall back to an unverified first address.
- **The email is held three times,** by Clerk, by `users.email` and by the Stripe customer, and nothing keeps the copies in step.
  - AUDIT-015 named this on 2026-10-08 and decided on one identity resolver (DEBT-502). It is not built.
  - AUDIT-015 placed it after the pre-sale items, 35 days before the earliest live renewal, because the first legal notice is about eleven months away (DEBT-511) and nothing it fixes loses money.
  - Meanwhile BUG-320 and BUG-332 were fixed with retries on the path the resolver will replace, as both records say.

**Subscriptions have one fenced write, but nothing owns what surrounds it.** Each point below was read in the code.
- **What is sound.**
  - Every writer reaches `stripe_subscriptions` through `persistSubscriptionObservation` and one upsert, after a fresh Stripe read.
  - The upsert takes a per-user advisory lock, a version fence and the domain's write guard.
- **What is not owned.** Each of the four callers decides what happens around that write, and they differ:
  - the webhook maps the customer, records consent, marks termination, alerts on a competing subscription and sweeps open Sessions;
  - the success page maps the customer only;
  - the reconcile maps the customer even when the write is refused, marks termination, alerts and cancels duplicates;
  - BUG-321's sync writes the row only.
- **The success page bypasses the shared Stripe path.** It parses the raw Stripe objects itself, in `app/` (`checkout-success-sync.tsx`), and calls the SDK without the circuit breaker that every other Stripe call goes through.
- **Wiring leaks into `app/`.**
  - The success page builds its own Stripe dependencies.
  - The reconcile's cron route runs its own Drizzle query (`listLocalSubscriptions`).
  - The container hands raw `db` and `stripe` clients to route handlers.
- **Billing policy is restated in adapters.**
  - The domain defines the blocking statuses (`BlockingCheckoutSubscriptionStatuses`). The Checkout gateway and the reconcile job each restate them in Stripe's terms instead of deriving them.
  - Checkout's reuse, replay and re-check policy lives in `stripe-checkout-sessions.ts`, which is 1,495 lines and makes 11 Stripe calls.
  - The webhook controller is 902 lines, with 12 transaction call sites, and it builds use cases inline.
- **No decision record states the model.**
  - The lock order is written only in a code comment, which counts the writers: "BUG-321's sync on a refused checkout is the fifth" (`subscription-write-lock.ts`).
  - ADR-014 accepts duplicated sync logic that "must remain consistent".

**What the model cannot see.**
- **A subscription we never recorded is never found.** The reconcile walks only the rows we already have. BUG-321's fix added a sync at request time instead.
- **A second live subscription is not stored.** `stripe_subscriptions` is unique on `user_id`, so the write guard keeps one. Since BUG-343's alerts, the webhook alerts when the subscription it does not store is entitled, but nothing records that subscription (BUG-343).
- **The plan is not stored.** Every read derives it from today's price IDs (DEBT-501 item 2).

**The layers meant to hold this are thin.** The domain and application layers are 9,343 of 57,305 production lines, about a sixth. Adapters are 17,746 lines and `app/` 19,862.

**The same two-writer shape exists for content.**
- Production content still seeds directly while releases exist beside it (DEBT-483, in Waiting).
- Data-model and content records were the larger family among those closed in September and October; BUG-314 was "Content writers do not share one serialization boundary".
- The production content bootstrap retires the direct seed, so that shape has a planned end, an owner decision.

### Finding 2: Tests and CI Depend on a Shared Identity and on Vendors That Change Without Notice

About a third of the open records concern tests, CI or the clones, not the product. Three are ordinary test defects: BUG-336, BUG-339 and BUG-342. The rest have two different causes.

**Sharing:** DEBT-508, DEBT-514, BUG-329 and BUG-341.
- Every E2E run, local or CI, signs in as one Clerk user on one development instance. DEBT-508 already gave each run its own Stripe customer; the Clerk user is the half that remains.
- Preview deployments share one database and one migration ledger (DEBT-445).
- Several sessions work in one clone at once.
  - lint-staged 17.6.0 would stage another session's work, so it is held at 17.5.1 (DEBT-514).
  - A test run from a worktree inside the clone marked the clone bare (BUG-341).
- The sessions on this machine coordinate by message before any E2E run, push or CI dispatch, and refuse E2E while any CI run is active. That is a local practice, not a rule in this repository. DEBT-508 calls it "coordination standing in for isolation".

**Vendors that change or fail without notice:** BUG-333, BUG-337, BUG-340, DEBT-510, DEBT-516 and DEBT-523.
- BUG-333 began with a Clerk JS release; Clerk JS loads unpinned (DEBT-521).
- Stripe renamed a checkbox on its hosted page (BUG-340).
- Codecov drops a status (DEBT-510).
- CI's database image depended on one registry (DEBT-516).
- GitHub dropped a push to `main` (DEBT-523).

**Overlap between runs is not the cause** of the E2E session losses. BUG-333 and BUG-337 each found no overlapping run. The recurring E2E chain (BUG-306, BUG-330, then BUG-333, BUG-337 and DEBT-508) is about Clerk's development-instance session behavior.

### Finding 3: The Process Machinery Is Large Next to the Product

DEBT-518 covers the records' share of it, and review capacity. This adds what DEBT-518 does not measure.
- **Size.**
  - Process scripts (merge guard, promotion, records, review, watchers), with their tests: 12,481 lines.
  - Repository-policy tests and their scanners: 10,383 lines.
  - Together they come to about 40% of the 57,305 production lines.
  - `docs/` Markdown is 2.10 MB, against 1.74 MB of production source.
  - The median closed record grew from about 2.5 KB in February and March to about 10 KB since April.
- **Scheduled machinery.** There are ten scheduled workflows and two crons.
  - Two watch each other: the alert watcher, and the renewal job that checks it.
  - Two watch vendors that fail silently: the release watch, for a push GitHub drops (DEBT-523), and the advisory watch (DEBT-509).
  - #1545, in review today, adds an alarm on those two watches.
  - BUG-344 was a defect in the advisory watch.
  - Part of this exists because the Hobby plan keeps runtime logs for one hour and offers no log drains (DEBT-505, DEBT-512).
- **Its share of the records is rising.** The process and tooling family is about 4% of all records, but about a fifth of those closed in October or still open. Among them are BUG-335, BUG-339, BUG-341, BUG-344, DEBT-510, DEBT-514, DEBT-515, DEBT-518, DEBT-519 and DEBT-523; some of these are also in Finding 2.
- **What it buys.** It has caught real defects. Second-agent challenges and reviews overturned designs before they shipped: DEBT-503 item 5, BUG-320's narrowing, BUG-343's two audits, and this record's own order. So the question is proportion, not whether to keep the rigor.

### Finding 4: Readiness for Performance and Concurrency

Nothing found needs restructuring before a performance pass. These points were read in the code or checked live:
- **Steady-state requests make no Clerk call.** The session token is verified locally with `jwtKey`, and an existing user costs two database round-trips. A signed-out visit to pricing reads no database.
- **Locking is safe.**
  - Locks are per user and transaction-scoped.
  - No vendor call runs inside a transaction.
  - Indexes match the hot predicates.
  - Prunes use `SKIP LOCKED`.
- **The regions match.** Production's functions run in `iad1` (`x-vercel-id`), and production's database host is in `us-east-1` (read 2026-10-16).

Settle these first, because later work builds on each.
1. **There is nothing to measure against.**
   - Runtime logs last one hour, nothing forwards pino's output, and browser measurement and Web Analytics are off (DEBT-479, DEBT-464).
   - The Waiting rows on performance (DEBT-450, DEBT-349) and DEBT-503 item 4 wait for numbers that nothing collects.
   - Production checks in Verifying records rest on the absence of Sentry events, at very low traffic. BUG-320 calls its own check weak evidence.
   - A performance pass first needs a baseline, with retention: per-route latency and database time.
   - More tracing reopens BUG-331's privacy question. Spans are scrubbed against a list of credential parameters, so their attributes should be allowed by name before the sample rate rises.
2. **Every page renders per request.**
   - The root layout reads the CSP nonce from `headers()`. So every route, marketing pages included, serves its static shell and then re-renders its tree in a function on every request.
   - The nonce serves a policy that only reports (`content-security-policy-report-only` in production). DEBT-420 found that a strict nonce policy cannot be enforced under Cache Components.
   - The cost is function usage, which is DEBT-522's trigger. Keep it or drop it deliberately, before caching work assumes either answer.
3. **Lifetime scores are computed when they are read.**
   - Every dashboard load runs a lifetime five-way join, including the answer-key-correction subquery (`scoreByUserId`), and ADR-022's rules add to it.
   - Whether scores stay computed on read or become a maintained rollup is easier to decide before more scoring rules arrive (DEBT-450 Part 4).

**The defect, filed as BUG-345.** The database timeouts DEBT-447 set as connection startup parameters do not apply through Neon's pooler. Read in production on 2026-10-16, there is no statement or lock timeout.

## Impact

- **Billing, fixed record by record.** The pre-sale items (DEBT-501 item 2's recorded plan, BUG-343 option 4) each touch all four subscription callers. Built one by one, they add more per-caller side effects to keep consistent. Those paths start handling money at the first live sale.
- **Identity, fixed record by record.** Each further retry on the request path is code the resolver later replaces (inferred).
- **Shared identities and unpinned vendors.** They turn flakes into records, re-runs and held production deploys. The cost rises with each session working in parallel (inferred).
- **Process weight.** The hourly review and the promotion after each change cap how many records can close in a week, whatever their size.
- **No baseline.** A performance pass would tune by guesswork, and production checks in Verifying records prove little.

## Options

1. **Keep fixing the records one by one, in today's order.** Cheapest now. Finding 1's history suggests billing and identity will keep producing records.
2. **Make the app the only creator of subscriptions** (BUG-343 option 8): a setup-mode Checkout, then the server creates the subscription. This ends the race on Stripe's hosted page. But it changes the purchase page, the disclosures and the consent flow (DEBT-414), before the first live sale. It is too large to be a prerequisite.
3. **Give subscription writes one owner before the pre-sale billing items, and build the identity resolver when the next identity fix is needed** (recommended). It is incremental, and each step ships as its own pull request.
4. **Also remove the shared Clerk user, keep worktrees out of the clone, and lighten the process** (Findings 2 and 3), each where it pays.

## Resolution (proposed; the owner decides)

**First, one small pull request.**

1. **BUG-345, the pooler timeouts.** It is a defect in shipped code, and the locks proposed below rely on bounded lock waits.

**Then, before the pre-sale billing items** (DEBT-501 items 2 and 3, BUG-343 option 4):

2. **One owner for subscription observations, in the application layer.**
   - It extends `persistSubscriptionObservation`, which already fences all four callers. It owns the customer mapping, consent termination and the duplicate alert around the write, so all four callers get the same side effects.
   - The success page goes through the gateway's normalizer and the Stripe retry wrapper.
   - The adapters derive the blocking statuses from the domain's set.
   - A guard keeps `app/` from calling the Stripe SDK or building billing dependencies, so the pattern stays deleted.
   - DEBT-501 item 2's recorded plan and BUG-343 option 4 are then built on it, once each.
   - Checkout's reuse and replay policy in the gateway moves out when it is next changed.
3. **An ADR for the ownership of billing and identity.** It names which system owns which fact, the one writer of each table and the lock order. It also states the invariants:
   - at most one live subscription per customer;
   - the stored row is Stripe's canonical one;
   - the plan is a recorded fact.

   It amends ADR-002 ("One subscription per user") and ADR-014.
4. **Check those invariants continuously.**
   - The reconcile checks each invariant and alerts on drift through DEBT-505's path.
   - It also lists the subscriptions of customers it has no row for. This changes DEBT-501 item 1's design, which orders `stripe_subscriptions` rows. `stripe_customers` also holds customers whose Checkout never completed.
   - "Stripe has it and we don't" then becomes visible (BUG-321's residual, DEBT-501 items 1 and 3). BUG-343's duplicate becomes detected, though not impossible.

**Identity:**

5. **The resolver stays where AUDIT-015 placed it,** unless the owner brings it forward.
   - The next identity defect is fixed by building the resolver, not with another retry on the request path.
   - Handling `user.created` in the resolver would reverse ADR-004's lazy provisioning, so it needs that ADR amended.

**Tests and CI:**

6. **A Clerk test user per E2E run** (DEBT-508's remaining half), and **session worktrees outside the clone** (DEBT-514, BUG-341).

**Before the performance pass:**

7. **A latency baseline with retention,** with span attributes allowed by name first (BUG-331).
8. **Decide the two structural choices:** the per-request root (with DEBT-522) and scoring at read time (DEBT-450 Part 4).

**The owner decides alongside:**

9. **Proportion in the process.**
   - A check that only waits for no error, at very low traffic, closes the record at promotion instead of holding it in Verifying. This changes the records index's Tracking and Statuses rules.
   - Vercel Pro (DEBT-512), at or before the first live sale, then retires the watchers its log retention and drains make redundant.
   - More CodeRabbit capacity is DEBT-518's open decision.

**Proceed now, unchanged:** every other open record, including BUG-321's provider-contract test and DEBT-501 items 4 and 8.

## Verification

- [x] A second agent challenged this record on its branch (2026-10-16). It found eleven factual errors, a misattributed cause in Finding 2, and a first step that went against AUDIT-015's reasons. All are corrected above.
- [ ] The owner decides whether items 2 to 4 come before the pre-sale billing items, and which of items 5 to 9 to adopt.
- [ ] Each adopted item has a home before this record closes:
  - item 1 is BUG-345;
  - items 2 and 4 belong in DEBT-501;
  - item 3 becomes an ADR;
  - item 5 belongs in DEBT-502;
  - items 6 to 8 belong in DEBT-508, DEBT-514, BUG-331, DEBT-522 and DEBT-450.
- [ ] The per-month record counts behind Finding 1 are in this record's pull request. When this record closes, a Waiting row re-measures them once items 2 to 4 have shipped.

## Related

- **Finding 1:** DEBT-501, DEBT-502 (the identity resolver), DEBT-511, BUG-320, BUG-321, BUG-332, BUG-343, DEBT-483, and AUDIT-015 (closed), whose order this keeps for identity.
- **Finding 2:** DEBT-508, DEBT-514, DEBT-521, BUG-333, BUG-337, BUG-340 and BUG-341.
- **Finding 3:** DEBT-515, DEBT-518 and DEBT-523.
- **Finding 4:** BUG-345, DEBT-349, DEBT-450, DEBT-479, DEBT-512, DEBT-522 and BUG-331.
