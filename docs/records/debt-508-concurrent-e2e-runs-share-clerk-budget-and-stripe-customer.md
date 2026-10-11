# DEBT-508: Concurrent E2E Runs Share One Clerk Rate Budget and One Stripe Customer

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — still to show: two overlapping CI runs both pass; in doubt, since a CI run overlapping a local run lost a Clerk session; due 2026-10-22
**Priority:** P2
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

Two E2E runs at the same time interfere in two ways.

1. **They spend one Clerk rate budget.** Every lane signs in as one Clerk user on one development instance, and Clerk limits that instance's Backend API per instance. When two runs overlap, Clerk answers 429. That fails a test's reset, and it fails the app's own user lookup, so a signed-in page renders as signed out.
2. **They change one Stripe customer.** Every CI run selects the same customer by its `e2e_owner` tag, and so does every local clone. One run's reset cancels that customer's subscriptions and detaches its cards while another run may be asserting on them.

`playwright.config.ts` runs one worker for this reason, but only within a run. CI's concurrency group is per branch, so a push to `main` and a pull request run side by side.

On 2026-10-07 that overlap failed both runs. All four of `main`'s failures trace to Clerk 429s. The Stripe sharing is a real hazard that did not cause them. One of the two runs was `main`'s on promotion #1417, so Vercel held the production deploy until the run was repeated. On this machine, agents now agree by message who may run E2E, which is coordination standing in for isolation.

## Evidence

- **Incident, 2026-10-07.**
  - `main`'s run 37613122068 ran E2E 11:27:08–11:31:38Z, and #1411's run 37613246595 ran 11:27:15–11:34:23Z. Both failed, and both passed on attempt 2 with the same commits (#1417's comments).
  - Two of `main`'s failures were the test reset's own `[E2E_RESET:CLERK_API_UNAVAILABLE] Clerk API request failed with status 429`.
  - The other two were a missing "You're already subscribed" and a missing verdict pill. The app server logged Clerk 429s, with `retryAfter` 6–7 s, from `getCurrentUser` at 11:30:32Z. The subscription check failed at 11:30:47Z.
  - Entitlement is read from the run's own database through the current user (`lib/auth-request-cache.ts`, `loadRequestAuthState`). With no user, the pricing page renders its signed-out view (`app/pricing/page.tsx`). So those two failures are Clerk 429s too, not lost Stripe state.
- **One Clerk rate budget for every lane.**
  - Clerk limits a development instance's Backend API to 100 requests per 10 seconds per instance ([system limits](https://clerk.com/docs/guides/how-clerk-works/system-limits)).
  - CI, the daily hosted-checkout smoke and every local clone use one Clerk user on one instance.
  - Until [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 1 (released 2026-10-08), the app made one `currentUser()` call per signed-in request (`lib/container.ts`).
  - The test helpers add more lookups:
    - Global setup looks the user up three times: preflight, the seed and the reset.
    - The reset looks it up again before each mutating test (`tests/e2e/helpers/e2e-reset-shared.ts`, `resolveClerkUserIdByEmail`).
    - The paid-subscription restore re-runs the seed, which looks it up once more (`tests/e2e/helpers/subscription.ts`, `restoreE2EUserPaidSubscription`; `tests/e2e/helpers/paid-checkout.ts`).
- **Retries are too short for rate limiting.**
  - `fetchClerkWithRetry` (`tests/e2e/helpers/credential-health-check.ts`) gives a 429 three attempts, waiting 100 ms and then 200 ms between them (`src/adapters/shared/retry-defaults.ts`). That covers about 0.3 s, and it ignores `Retry-After`.
  - The seed's lookup (`tests/e2e/helpers/seed-test-user.ts`) does not retry.
  - BUG-312 added these retries for brief network failures, not rate limiting.
- **One Stripe customer per lane.**
  - The seed and the checkout helpers select the customer whose `metadata.e2e_owner` matches `E2E_STRIPE_OWNER` (`seed-test-user.ts`, `findOwnerMatchedStripeCustomer`; `checkout-consent.ts`; `portal-cancellation.ts`; `checkout-success-provider-contract.ts`).
  - CI sets `E2E_STRIPE_OWNER: github-ci` for every run (`ci.yml`). Every local clone uses `local-dev`.
  - `resetE2EUserToFirstTimer` cancels that customer's live subscriptions and detaches its cards (`subscription.ts`). The seed then attaches a card and creates or rewrites a subscription.
  - The app database is per runner and per clone (DEBT-417), so it is not shared.
- **Nothing serializes runs.**
  - `ci.yml` groups runs by `${{ github.workflow }}-${{ github.head_ref || github.ref }}`.
  - DEBT-293 found that no spec changed Stripe rows. `checkout-redirect.spec.ts` has since made that untrue.
  - DEBT-471 F5 named provider rate limits as a boundary that is not isolated.
- **Frequency.** Across the last 120 CI runs, 11 pairs of E2E windows overlapped and 10 of those pairs passed. Both failures in that sample are the 2026-10-07 pair, and the non-overlapping windows had none.

## Impact

- An overlap fails E2E on changes that cannot cause it, so the gate stops meaning "this change is broken".
- On `main`, a failed run blocks the production alias through Vercel's deployment check until someone finds the cause and re-runs. Repository rules allow one re-run before the cause is documented.
- The risk grows with every agent pushing in parallel. On this machine it already costs messages and waiting before every E2E run.

## Options

1. **Serialize CI's E2E.** Put E2E in its own job under one repository-wide concurrency group, with `queue: max`. This prevents overlap between CI runs, not with local runs. It needs a job split that keeps the required check named `test`, and every run waits for every other.
2. **Spend less of the Clerk budget, and wait when Clerk says to.**
   - Look the user up once per run.
   - Honor `Retry-After` on a 429.
   - The largest spender, the app's per-request lookup, is removed by DEBT-503 item 1.
3. **Give each run its own Stripe customer.** CI tags its customer by run and attempt, and each local clone by the clone identity its test target already resolves. Each run's state is then its own, with no queue. Runs from one clone share its owner, as they already share its test database, so they must not overlap.
4. **A lease on the shared identity, honored by every lane.** This covers everything, but CI and local runs share no store both can write atomically, and CI has `contents: read` only.

## Resolution

**Decided:** options 2 and 3, and DEBT-503 item 1 moves ahead of DEBT-505. Isolate what runs change, and stop spending what they share. Decided by engineering under the owner's delegation, 2026-10-07.

- **Stripe, per run.**
  - CI sets `E2E_STRIPE_OWNER: github-ci-${{ github.run_id }}-${{ github.run_attempt }}`. A re-run keeps its `run_id`, so the attempt keeps each attempt separate.
  - The local orchestrator sets `local-clone-<instanceId>` for the Playwright step, from the resolver that gives each clone its database port, on isolated and existing-database runs alike. Only a value exported in the shell overrides it; one in `.env.local` is ignored.
  - Global setup sweeps stale customers, and global teardown deletes the run's own CI customer. Both only warn on failure, and each stops at its own deadline (10 and 8 seconds), since a Playwright timeout cannot be caught. A cancelled CI run never reaches teardown, so the sweep is the main cleanup, not a backstop.
  - The sweep deletes at most 10 customers per setup attempt. It takes only test-mode customers whose owner matches `^github-ci-\d+-\d+$`, created more than a day ago, other than the current run's.
  - The shared Clerk user and the existing `github-ci`, `local-dev` and `github-stripe-hosted-smoke` customers never match that pattern, so they are never deleted or replaced.
  - The daily hosted-checkout smoke keeps its owner, since it is already serialized by its own group.
- **Clerk, once per run.**
  - Preflight returns the Clerk user ID, and the seed takes it instead of looking it up again.
  - The reset and the restore helpers find the user in the run's own database, where the seed wrote it: the reset by email, ignoring case, since Clerk stores emails lowercased and the app writes Clerk's back.
  - `fetchClerkWithRetry` honors `Retry-After`, as seconds or as an HTTP date, until one call's waits total 10 seconds. The cap bounds waits only: each call can also spend three 15-second attempts, so preflight's two calls can take about 110 seconds, beyond setup's 60-second budget. [BUG-330](../_archive/bugs/bug-330-stored-clerk-session-lost-after-token-expiry.md) gives them one deadline inside it. The seed's lookup, when one is still needed, uses it.
  - Each `local-clone-*` customer keeps its active test subscription for as long as its clone exists; a deleted clone's customer is harmless test-mode clutter.
- **Not serialized.** Serializing would make every run wait. Per-run Stripe ownership already stops one run from changing another's billing state, and fewer Clerk calls lower the rate-limit pressure. Overlapping runs can still meet Clerk 429s until DEBT-503 item 1 removes the app's per-request lookup, so the overlap check follows it.
- **Until DEBT-503 item 1 ships:**
  - The app's per-request lookups still share the budget, so two overlapping runs can still meet a 429.
  - One E2E run at a time stays the rule on this machine, and nobody pushes while `main`'s E2E runs after a promotion.
  - DEBT-503 item 1 is the structural fix for both production and CI, so it moves ahead of DEBT-505 in the register's Now stanza.

## The rest of the CI chain, 2026-10-07

Every CI failure class seen today, and the Stripe hazard found with them, now has its own record and a decided fix:

| Failure | Cause | Record |
| --- | --- | --- |
| Clerk 429s when E2E runs overlap | The app's per-request Backend API lookup | [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 1, released 2026-10-08; the overlap check follows |
| Runs can change each other's Stripe state (a hazard; it caused none of today's failures) | One Stripe customer per lane | This record |
| Signed-in tests fail after the stored token expires | A failed Clerk session restore, undiagnosable | [BUG-330](../_archive/bugs/bug-330-stored-clerk-session-lost-after-token-expiry.md) |
| `codecov/patch` missing after a good upload | Codecov drops the notification | [DEBT-510](./debt-510-codecov-drops-patch-notifications.md) |

## Verification

- [x] CI's E2E step tags its customer by run and attempt, and `tests/e2e-test-identity-workflows.test.ts` pins it. The local orchestrator sets the per-clone owner, and its test pins the precedence.
- [x] Helper tests prove that:
  - a 429 with `Retry-After` is retried after that delay, in both header forms;
  - the reset needs no Clerk secret, since it no longer imports a Clerk call;
  - the seed calls Clerk only when no ID is passed in.
- [x] Sweep tests prove it deletes only stale per-run CI customers, never another owner's, at most 10 per setup attempt, and that cleanup stops at its deadline. A CI run's log shows teardown deleting its own customer.
- [ ] Two overlapping CI runs both pass. DEBT-503 item 1, which this depends on, was released on 2026-10-08. Not yet observed.

  *Added 2026-10-08:*
  - **The failure.** A local `pnpm test:e2e` ran inside another pull request's CI E2E window. One test lost its Clerk session and was redirected to sign-in, at `helpers/session.ts`'s `startSession` check; the other 62 passed.
  - **The control.** The same suite had passed 63/63 alone minutes earlier.
  - **The cause.** Each run has its own Stripe customer, but both sign in as one shared Clerk user, so this isolation does not cover Clerk sessions. Two overlapping CI runs share that user too.
  - **Until this is resolved,** sessions on this machine serialize E2E runs, CI included, and this check may fail.

  *Added 2026-10-09: overlap is not shown to be the cause.* #1440's CI run 37983577282 failed the same way: one test's `startSession` check found itself redirected to sign-in, and 62 passed. No other E2E run was in its window. So the 2026-10-08 failure may be this same mid-run loss, which [BUG-333](../bugs/bug-333-signed-in-e2e-test-loses-its-clerk-session-mid-run.md) records, rather than an effect of the overlap. A failure of this check therefore says nothing about isolation until that loss is explained.
