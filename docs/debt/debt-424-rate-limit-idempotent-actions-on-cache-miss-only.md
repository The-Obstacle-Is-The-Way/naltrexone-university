# DEBT-424: Rate-Limit Idempotent Server Actions on Cache-Miss Only (replay-before-limit)

**Status:** In Review
**Priority:** P3
**Date:** 2026-06-24
**Component:** Idempotency / Rate Limiting / Adapter controllers
**Surfaced by:** CodeRabbit review of the BUG-259 fix (PR #508)

---

## Problem

`executeIdempotent` bridges keyed controller actions into `withIdempotency` ([`execute-idempotent.ts`](../../src/adapters/controllers/shared/execute-idempotent.ts#L37)); its only local short-circuit is the no-key fast path ([`execute-idempotent.ts`](../../src/adapters/controllers/shared/execute-idempotent.ts#L35)). In the keyed path, `withIdempotency` claims a fresh key ([`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L78)), but cache hits return the stored result or rethrow the stored error **without** running the `execute` closure ([`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L141), [`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L145)).

Every rate-limited idempotent action runs its limiter **before** `executeIdempotent` (the deliberate ordering from BUG-204, applied to the in-place actions by BUG-259, to avoid caching `RATE_LIMITED` errors). Because the limiter runs on **every** request, an idempotent **replay** — a retry with the same `idempotencyKey` for an operation that already completed — is gated behind the limiter. If the user's quota is exhausted at the moment of the retry, the call returns `RATE_LIMITED` instead of replaying the stored success or stored use-case error.

This is **transient and self-healing** (once the limiter window passes, the same key replays the stored result) and **consistent across the codebase** (billing has always done this), so it is not a regression. But it is not the ideal semantics: a replay performs no new work and should return the stored result regardless of the current rate-limit state. CodeRabbit flagged it as `Data Integrity / Major` on PR #508 ("Don't gate idempotency replays behind the rate limiter"); the BUG-259 fix intentionally shipped the simpler, billing-consistent hoist and deferred the cross-cutting ideal here.

## Complete scope matrix (verified 2026-06-24)

Every `executeIdempotent` call site was enumerated and classified by rate-limit ordering.

### In scope — LIMITER-BEFORE-IDEMPOTENCY (gates replays) — 8 actions

| Action | Limiter (file:line, key constant) | `executeIdempotent` |
|--------|-----------------------------------|---------------------|
| `submitAnswer` | [`question-controller.ts:235`](../../src/adapters/controllers/question-controller.ts#L235) · `SUBMIT_ANSWER_RATE_LIMIT` | [L259](../../src/adapters/controllers/question-controller.ts#L259) |
| `toggleBookmark` | [`bookmark-controller.ts:81`](../../src/adapters/controllers/bookmark-controller.ts#L81) · `BOOKMARK_MUTATION_RATE_LIMIT` | [L99](../../src/adapters/controllers/bookmark-controller.ts#L99) |
| `rateQuestion` | [`question-feedback-controller.ts:131`](../../src/adapters/controllers/question-feedback-controller.ts#L131) · `QUESTION_RATING_RATE_LIMIT` | [L152](../../src/adapters/controllers/question-feedback-controller.ts#L152) |
| `submitQuestionReport` | [`question-feedback-controller.ts:183`](../../src/adapters/controllers/question-feedback-controller.ts#L183) · `QUESTION_REPORT_RATE_LIMIT` | [L205](../../src/adapters/controllers/question-feedback-controller.ts#L205) |
| `startPracticeSession` | [`practice-controller.ts:183`](../../src/adapters/controllers/practice-controller.ts#L183) · `START_PRACTICE_SESSION_RATE_LIMIT` | [L205](../../src/adapters/controllers/practice-controller.ts#L205) |
| `discardPracticeSession` | [`practice-controller.ts:286`](../../src/adapters/controllers/practice-controller.ts#L286) · `PRACTICE_SESSION_MUTATION_RATE_LIMIT` | [L299](../../src/adapters/controllers/practice-controller.ts#L299) |
| `createCheckoutSession` | [`billing-controller.ts:111`](../../src/adapters/controllers/billing-controller.ts#L111) · `CHECKOUT_SESSION_RATE_LIMIT` | [L139](../../src/adapters/controllers/billing-controller.ts#L139) |
| `createPortalSession` | [`billing-controller.ts:157`](../../src/adapters/controllers/billing-controller.ts#L157) · `PORTAL_SESSION_RATE_LIMIT` | [L183](../../src/adapters/controllers/billing-controller.ts#L183) |

> Note: `discardPracticeSession` and billing were already "limiter-before-`executeIdempotent`" before BUG-259 (so they never cached `RATE_LIMITED`), but they still gate replays — so they are in scope for *this* debt. BUG-259 only changed the four in-place actions + `startPracticeSession` from limiter-inside-closure to this ordering; this debt is the next step for all eight.

### Out of scope — IDEMPOTENT, NO LIMITER (nothing gates the replay) — 3 actions

Unchanged by the fix below (no `beforeExecute` hook is passed):

- `endPracticeSession` ([`practice-controller.ts:265`](../../src/adapters/controllers/practice-controller.ts#L265))
- `finalizeExamAnswers` ([`practice-controller.ts:332`](../../src/adapters/controllers/practice-controller.ts#L332))
- `setPracticeSessionQuestionMark` ([`practice-controller.ts:411`](../../src/adapters/controllers/practice-controller.ts#L411))

### Out of scope — considered and explicitly excluded

- **Webhook route limiters** — the Stripe ([`app/api/stripe/webhook/handler.ts:49`](../../app/api/stripe/webhook/handler.ts#L49)) and Clerk ([`app/api/webhooks/clerk/handler.ts:66`](../../app/api/webhooks/clerk/handler.ts#L66)) routes apply a **per-IP abuse limiter at the route boundary** (before signature verification), and the handlers do event-dedup via a **claim/lock/process/mark repository pattern** (`StripeEventRepository` / `ClerkEventRepository`), not `executeIdempotent`. This is a different concern (endpoint abuse protection vs. user-action replay); folding it into the cache-miss model would change abuse-protection semantics. Excluded; revisit as a separate item only if webhook-retry-during-throttle is ever observed. (Health and cron route limiters are likewise route-level and non-idempotent.)
- **Provider-native idempotency** — the Stripe payment gateway uses deterministic Stripe idempotency keys internally; that is provider-level, not the app's `withIdempotency`. Out of scope.
- **No LIMITER-INSIDE-CLOSURE remains** — verified: after BUG-259 + its consistency hoist, no idempotent action runs its limiter inside the `execute` closure. (If one reappears, it is a BUG-259 regression, not this debt.)

## Decision (no optionality)

Move the rate-limit check **inside** the shared idempotency wrapper, gated on a **cache-miss/fresh-claim only**.

Add an optional `beforeExecute` hook to `executeIdempotent` / `withIdempotency` that runs only for the caller that wins the fresh idempotency claim, after cache-hit/in-progress replay has been ruled out and before the mutation closure executes. On a cache-hit the hook is skipped, so the stored result/error replays untouched. A `RATE_LIMITED` thrown by `beforeExecute` is raised to the caller **without being stored** and **without leaving a pending idempotency row**.

The cleanup piece is required by the live `withIdempotency` state machine: `repo.claim(...)` creates an incomplete row before `execute()` runs ([`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L78), [`drizzle-idempotency-key-repository.ts`](../../src/adapters/repositories/drizzle-idempotency-key-repository.ts#L38)). A naive "claim then run hook" would avoid storing `RATE_LIMITED`, but would leave the key pending until zombie recovery. Therefore the implementation must make hook-denied claims explicitly abortable and make pollers tolerate that abort.

1. Add `beforeExecute?: () => Promise<void>` to `executeIdempotent` and `withIdempotency`; keep the no-key fast path running `beforeExecute` then `execute`.
2. Extend `IdempotencyKeyRepository` (fake + Drizzle implementation) so `claim(...)` returns the row's `claimedAt` token on a fresh claim/reclaim and `null` on cache-hit/pending-hit. Add a narrow `abortClaim(userId, action, key, claimedAt)` operation that removes only the still-incomplete row for that exact claim (`claimedAt` matches, `completedAt IS NULL`, and no stored error). Thread the same token through `storeResult(...)` and `storeError(...)` so stale executions cannot persist over a newer reclaimed claim. In `withIdempotency`, after a successful `claim`, run `beforeExecute` before `execute`; if the hook throws, best-effort abort that exact incomplete claim, log abort failures without masking the original error, and rethrow the original error without calling `storeError`.
3. Update the polling branch so a waiter that observes a hook-aborted/missing row restarts the claim/read loop instead of returning the current "Idempotency key disappeared during poll" internal error. Keep true store-result / store-error replay behavior unchanged.
4. Update all **8 in-scope** controllers to pass their `rateLimiter.limit(...)` + `RATE_LIMITED` throw as `beforeExecute` instead of running it ahead of `executeIdempotent`. Leave the 3 no-limiter actions and the webhook routes untouched.
5. Keep action names, idempotency keys, schemas, output parsing, and use-case calls unchanged.

### Rejected alternatives

- **Keep limiter-before-`executeIdempotent` (today).** Simple and consistent, but gates replays — the exact residual this debt closes.
- **Limiter inside the closure (pre-BUG-259).** Caches `RATE_LIMITED` and replays the stale error for up to the idempotency TTL — this is BUG-259; do not revert.
- **Per-controller bespoke cache-peek before the limiter.** Duplicates cache-lookup logic across 8 controllers and will drift. The shared wrapper is the single correct seam.
- **Naive claim-then-hook without aborting the claim.** Avoids storing `RATE_LIMITED`, but leaves a pending idempotency row when the hook denies; subsequent same-key calls can time out or wait for zombie recovery.

## Acceptance Criteria

- [x] `withIdempotency` / `executeIdempotent` accept a `beforeExecute` hook that runs only on a fresh claim/cache miss (and on the no-key fast path), before execute, and whose thrown error is never stored.
- [x] A `beforeExecute` denial aborts only the exact incomplete idempotency claim it created; immediate same-key retry is not wedged behind a pending row, same-key waiters do not surface `INTERNAL_ERROR` from a disappeared aborted claim, stale hook failures cannot delete a newer reclaimed row, and stale executions cannot store a result/error over a newer reclaimed claim.
- [x] All 8 in-scope controllers pass their limiter via the hook; none runs the limiter ahead of the cache lookup. The 3 no-limiter actions and webhook routes are unchanged.
- [x] Per in-scope action, TDD: (a) a replay with a reused key **while rate-limited** returns the **stored** success/error (CodeRabbit's `[success, RATE_LIMITED]` shape — second call equals the cached first, one use-case invocation); (b) a **fresh** execution is still rate-limited and the `RATE_LIMITED` is **not** cached; (c) success stays idempotent; (d) genuine use-case errors stay cached.
- [x] Billing checkout/portal adopt the same hook (no behavior drift versus the other actions).
- [x] Full gate green (typecheck, lint, unit, build).

## References

- **BUG-259** (`docs/_archive/bugs/` once archived) — the fix that surfaced this; shipped the billing-consistent hoist and deferred the ideal here.
- **BUG-204** — established the deliberate limiter-before-idempotency ordering for billing.
- CodeRabbit PR #508 — `Data Integrity / Major` findings on `bookmark-controller.ts`, `practice-controller.ts`, `question-feedback-controller.ts`.
