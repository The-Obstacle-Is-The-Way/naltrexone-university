# DEBT-424: Rate-Limit Idempotent Server Actions on Cache-Miss Only (replay-before-limit)

**Status:** Open
**Priority:** P3
**Date:** 2026-06-24
**Component:** Idempotency / Rate Limiting / Adapter controllers
**Surfaced by:** CodeRabbit review of the BUG-259 fix (PR #508)

---

## Problem

`executeIdempotent` ([`execute-idempotent.ts`](../../src/adapters/controllers/shared/execute-idempotent.ts#L34)) short-circuits on a **cache-hit** — `withIdempotency` returns the stored result or rethrows the stored error **without** running the `execute` closure ([`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L141)).

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
| `startPracticeSession` | [`practice-controller.ts:184`](../../src/adapters/controllers/practice-controller.ts#L184) · `START_PRACTICE_SESSION_RATE_LIMIT` | [L205](../../src/adapters/controllers/practice-controller.ts#L205) |
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

Move the rate-limit check **inside** the shared idempotency wrapper, gated on a **cache-miss only**.

Add an optional `beforeExecute` hook to `executeIdempotent` / `withIdempotency` that runs **after** the key lookup determines there is no stored result and **before** the closure executes. On a cache-hit the hook is skipped, so the stored result/error replays untouched. A `RATE_LIMITED` thrown by `beforeExecute` is raised to the caller **without being stored** (it is thrown before the execute/store step, so BUG-259's no-cache property is preserved).

1. Add `beforeExecute?: () => Promise<void>` to `executeIdempotent` and `withIdempotency`; run it only on the fresh-execution path, before `execute`, and never persist an error it throws. Keep the no-key fast path running `beforeExecute` then `execute`.
2. Update all **8 in-scope** controllers to pass their `rateLimiter.limit(...)` + `RATE_LIMITED` throw as `beforeExecute` instead of running it ahead of `executeIdempotent`. Leave the 3 no-limiter actions and the webhook routes untouched.
3. Keep action names, idempotency keys, schemas, output parsing, and use-case calls unchanged.

### Rejected alternatives

- **Keep limiter-before-`executeIdempotent` (today).** Simple and consistent, but gates replays — the exact residual this debt closes.
- **Limiter inside the closure (pre-BUG-259).** Caches `RATE_LIMITED` and replays the stale error for up to the idempotency TTL — this is BUG-259; do not revert.
- **Per-controller bespoke cache-peek before the limiter.** Duplicates cache-lookup logic across 8 controllers and will drift. The shared wrapper is the single correct seam.

## Acceptance Criteria

- [ ] `withIdempotency` / `executeIdempotent` accept a `beforeExecute` hook that runs only on a cache-miss (and on the no-key fast path), before execute, and whose thrown error is never stored.
- [ ] All 8 in-scope controllers pass their limiter via the hook; none runs the limiter ahead of the cache lookup. The 3 no-limiter actions and webhook routes are unchanged.
- [ ] Per in-scope action, TDD: (a) a replay with a reused key **while rate-limited** returns the **stored** success/error (CodeRabbit's `[success, RATE_LIMITED]` shape — second call equals the cached first, one use-case invocation); (b) a **fresh** execution is still rate-limited and the `RATE_LIMITED` is **not** cached; (c) success stays idempotent; (d) genuine use-case errors stay cached.
- [ ] Billing checkout/portal adopt the same hook (no behavior drift versus the other actions).
- [ ] Full gate green (typecheck, lint, unit, build).

## References

- **BUG-259** (`docs/_archive/bugs/` once archived) — the fix that surfaced this; shipped the billing-consistent hoist and deferred the ideal here.
- **BUG-204** — established the deliberate limiter-before-idempotency ordering for billing.
- CodeRabbit PR #508 — `Data Integrity / Major` findings on `bookmark-controller.ts`, `practice-controller.ts`, `question-feedback-controller.ts`.
