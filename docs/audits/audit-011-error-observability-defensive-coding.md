# AUDIT-011: Error Observability & Defensive Coding Sweep

**Date:** 2026-03-07
**Scope:** Primary production sweep (`src/`, `app/`) with targeted spot checks in adjacent runtime files — error handling, type safety, array access, concurrency
**Method:** Initial multi-agent sweep plus post-commit tracer-bullet verification against the live codebase
**Axes:** Silent fallbacks, missing error handling, type safety, defensive indexing, dead code

---

## Summary

| Outcome | Count | Description |
|---------|-------|-------------|
| **P2 debt** | 1 | DEBT-286: SPEC-016 still lacks a standard path for caught client-side errors to reach Sentry |
| **P4 bugs** | 2 | BUG-201: unnecessary Clerk webhook output cast. BUG-202: redundant condition after `.find()` |
| **Invalidated** | 1 | BUG-199: documented Stripe empty-array `TypeError` / HTTP 500 path is not reachable in current production code |

**Overall:** The codebase remains disciplined. The sweep surfaced one real systemic observability gap, one minor type-safety cleanup, and one minor clarity issue. The originally filed array-index bug was invalidated after deeper tracer-bullet verification.

---

## Post-Commit Tracer-Bullet Verification

Further verification revised the original audit outcome in three important ways:

1. **BUG-199 was overstated**
   `stripe-subscription-normalizer.ts` does use `subscription.items.data[0]`, but every production caller validates `items.data` through `stripeSubscriptionSchema`, which requires `.min(1)`. The empty-array case yields `INVALID_WEBHOOK_PAYLOAD`, not `TypeError`.

2. **BUG-201 is narrower than first described**
   The Clerk webhook route has two `as unknown as` casts, but only the output cast is avoidable. The input cast is currently compensating for Clerk's too-narrow `RequestLike` type.

3. **DEBT-286 needed wider horizontal coverage**
   The systemic client-side observability gap is real, but the original inventory was incomplete. A repo-wide sweep found an additional caught-error flow in `use-practice-available-questions-count.ts`, plus several boundary/dev-only console or bare-catch sites that should remain visible but stay out of scope for this debt.

---

## Verified Findings

### ~~BUG-199~~ → INVALIDATED

The documented production failure mode was wrong.

- `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:55` still contains an unguarded `[0]`
- `src/adapters/gateways/stripe/stripe-webhook-schemas.ts:12-21` already requires `items.data.min(1)`
- `retrieveAndNormalizeStripeSubscription()` safe-parses before calling the normalizer
- existing tests already verify `items: { data: [] }` becomes `INVALID_WEBHOOK_PAYLOAD`
- `app/api/stripe/webhook/handler.ts` maps that path to HTTP `400`, not `500`

This remains a latent local hazard if a future caller bypasses validation, but it is not a live production bug today.

### ~~BUG-200~~ → DEBT-286: Client-side caught error reporting (P2) — RECLASSIFIED

This remains the major outcome from the sweep.

- `Sentry.captureException()` calls in `app/` + `src/`: **0**
- `Sentry.captureMessage()` calls in `app/` + `src/`: **0**
- SPEC-016 still stops its acceptance criteria at Sentry initialization
- verified client-side caught-error flows still fall back to console-only or silent handling

**Reclassified as [DEBT-286](../debt/debt-286-client-side-error-reporting.md)** — extends SPEC-016 with a `reportClientError()` utility that wraps `Sentry.captureException()`, then systematically replaces all 7 ad-hoc `console.error` / bare-catch locations.

Priority rollout targets:

- `app/(app)/app/practice/fire-and-forget.ts`
- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts`
- `app/(app)/app/practice/hooks/use-practice-session-tags.ts`
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts`
- `app/(app)/app/questions/[slug]/question-page-logic.ts`
- `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts`
- `app/(app)/app/practice/hooks/use-practice-available-questions-count.ts`

### BUG-201: unnecessary Clerk webhook output cast

`app/api/webhooks/clerk/route.ts:13-17` uses two `as unknown as` casts, but tracer-bullet verification showed only one is a real issue:

- **input cast:** currently required because Clerk types `verifyWebhook()` against `RequestLike`, which omits Web `Request`
- **output cast:** unnecessary because Clerk's `WebhookEvent` already satisfies our broader local `ClerkWebhookEvent` shape

This is a type-safety cleanup, not a demonstrated runtime bug.

### BUG-202: redundant condition after `.find()`

`app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts:73-74` is exactly as documented:

```typescript
const failed = responses.find((entry) => !entry.result.ok);
if (failed && !failed.result.ok) {
```

The second condition is redundant by definition of the `.find()` predicate.

---

## Additional Sweep Results

Primary production-code sweep (`app/` + `src/`, tests excluded):

- `console.error(...)`: **7**
- `console.warn(...)`: **2**
- `console.log(...)`: **0**
- client-side bare `catch {}` blocks: **2**
- server/application bare `catch {}` blocks: **4**

Important related sites outside the core DEBT-286 rollout:

- `app/global-error.tsx:16` logs an already-bubbled boundary error
- `components/error-boundary-page.tsx:33` logs already-bubbled route-boundary errors for shared `error.tsx` pages
- `app/(app)/app/practice/shared/question-flow-actions.ts:142` logs only in development
- `app/(app)/app/questions/[slug]/question-page-client.tsx:56` uses a bare catch for URL normalization
- `app/(app)/app/questions/[slug]/page.tsx:65` uses direct server-side `console.info`

The array-index sweep found no additional crash-risk `[0]` sites in production code beyond the latent normalizer line that is already protected by upstream validation.

---

## Clean Areas

- `ApplicationError` usage remains consistent across layers
- server action boundaries still route through `createAction`
- no `as any`, `@ts-ignore`, or `eslint-disable` markers were found in production code
- no SQL injection, XSS, or hardcoded-secret issues were discovered during this sweep
- domain-layer purity remains intact
