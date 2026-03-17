# BS-056: Magic Numbers, Hard-Coded Literals, and Constant Duplication Audit

**Date:** 2026-03-17
**Triggered by:** Proactive codebase-wide debt sweep for hard-coded values, magic numbers, and duplicated constant definitions.
**Scope:** Anywhere in `src/` and `app/` where a raw literal should be a named constant, or where named constants are duplicated instead of shared.
**Related:** None (first audit of this category)

---

## The Problem

The codebase is well-disciplined about naming constants — most values live in dedicated files like `rate-limits.ts`, `validation-limits.ts`, and `routes.ts`. However, a full audit reveals **six categories** of inconsistency where raw literals survive alongside named constants, or where identical constants are defined in multiple files instead of imported from a single source.

None of these are bugs. All are maintainability risks: a future developer changes the timeout in one file but not the other eleven, or uses raw `1000` for a ms→s conversion that drifts from the named constant elsewhere.

---

## Findings

### F1: Retry Configuration Duplication — HIGH

The identical retry config `{ maxAttempts: 3, initialDelayMs: 100, factor: 2, maxDelayMs: 1000 }` is defined **four times** in three separate files:

| File | Line | Form |
|------|------|------|
| `src/adapters/gateways/stripe/stripe-retry.ts` | 4–9 | `const STRIPE_RETRY_OPTIONS = { ... } as const` |
| `src/adapters/gateways/stripe-subscription-canceler.ts` | 26–31 | `const STRIPE_RETRY_OPTIONS = { ... } as const` (duplicate name, different file) |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | 25–30 | `const STRIPE_RETRY_OPTIONS = { ... } as const` (third copy, app layer) |
| `src/adapters/gateways/clerk-auth-gateway.ts` | 49–52 | Inline raw values in `retry()` call — no constant at all |

**Risk:** If retry policy changes (e.g., bump `maxAttempts` to 5 after an incident), three files need updating and the fourth has no constant to update.

---

### F2: Duplicated Timeout Constants (10s and 15s tiers) — HIGH

**12 separate `= 10_000` constants**, all representing "standard API call timeout":

| File | Line | Constant Name |
|------|------|---------------|
| `app/(app)/app/practice/practice-page-bookmarks.ts` | 5 | `BOOKMARKS_LOAD_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-tags.ts` | 5 | `TAGS_LOAD_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-available-count.ts` | 9 | `AVAILABLE_COUNT_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-incomplete-session.ts` | 9 | `INCOMPLETE_SESSION_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 28 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` | 19 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` | 24 | `MARK_FOR_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | — | (not 10k — see 15k below) |
| `app/(app)/app/history/hooks/use-history-sessions.ts` | 20 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/shared/bookmark-toggle.ts` | 5 | `TOGGLE_BOOKMARK_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 18 | `PREVIOUS_ATTEMPT_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | 41–42 | `SESSION_REVIEW_TIMEOUT_MS`, `BOOKMARK_LOOKUP_TIMEOUT_MS` |

**7 separate `= 15_000` constants**, all representing "critical mutation timeout":

| File | Line | Constant Name |
|------|------|---------------|
| `app/(app)/app/practice/practice-page-session-start.ts` | 11 | `SESSION_START_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-incomplete-session.ts` | 10 | `ABANDON_SESSION_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 27 | `END_SESSION_TIMEOUT_MS` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | 10 | `LOAD_QUESTION_TIMEOUT_MS` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | 11 | `SUBMIT_ANSWER_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 16 | `QUESTION_LOAD_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 17 | `ANSWER_SUBMIT_TIMEOUT_MS` |

**Risk:** Two implicit timeout tiers exist (10s for reads, 15s for mutations) but the policy is not codified. Each file redeclares the magic number independently.

---

### F3: HTTP Status Codes as Raw Literals — MEDIUM

**22 raw status code literals** across 4 route handlers, plus 2 in `retry.ts`:

| File | Raw Codes Used |
|------|----------------|
| `app/api/stripe/webhook/handler.ts` | `400`, `429`, `503`, `200`, `400`, `500` (6 instances) |
| `app/api/cron/reconcile-stripe-subscriptions/route.ts` | `401` ×3, `429`, `503`, `500`, `200` (7 instances) |
| `app/api/webhooks/clerk/handler.ts` | `429`, `503`, `400` ×2, `200`, `500` (6 instances) |
| `app/api/health/handler.ts` | `429`, `503`, `500` (3 instances) |
| `src/adapters/shared/retry.ts:48,52` | `=== 429`, `>= 500`, `< 600` |

No `HTTP_STATUS` constants file exists. Every handler writes raw numbers.

**Risk:** Low functional risk (HTTP codes don't change), but it's inconsistent with the codebase's otherwise thorough constant extraction. Readability suffers — `{ status: 503 }` is less self-documenting than `{ status: HTTP_SERVICE_UNAVAILABLE }`.

---

### F4: Duplicated `STACK_TRACE_LIMIT` — MEDIUM

`const STACK_TRACE_LIMIT = 1000` is defined identically in two files:

| File | Line |
|------|------|
| `src/adapters/controllers/stripe-webhook-controller.ts` | 32 |
| `src/adapters/controllers/clerk-webhook-controller.ts` | 141 |

Both use it for `error.stack?.slice(0, STACK_TRACE_LIMIT)`. Should be a single shared constant.

---

### F5: Duplicated Day-in-Milliseconds Definitions — MEDIUM

`86_400_000` (ms/day) is defined or used as a raw literal in multiple places:

| File | Line | Form |
|------|------|------|
| `src/domain/services/statistics.ts` | 1 | `export const DAY_MS = 86_400_000` (canonical) |
| `src/adapters/shared/with-idempotency.ts` | 9 | `const DEFAULT_TTL_MS = 86_400_000` (redefinition) |
| `src/adapters/controllers/stripe-webhook-controller.ts` | 33 | `90 * 86_400_000` (raw literal in expression) |
| `src/domain/test-helpers/factories.ts` | 123 | `+ 86_400_000` (raw in test factory) |

And `86_400` (seconds/day):

| File | Line | Form |
|------|------|------|
| `src/application/use-cases/submit-answer.ts` | 44 | `SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS = 86_400` |

**Risk:** `DAY_MS` is exported but not imported where it could be. Three files use the raw number instead.

---

### F6: Raw Millisecond ↔ Second Conversions — LOW

Named constants exist (`MS_PER_SECOND` in `session-stats.ts:8`, `SECOND_MS` in `drizzle-rate-limiter.ts:13`) but raw `* 1000` and `/ 1000` appear in 5 non-test locations:

| File | Line | Expression |
|------|------|------------|
| `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts` | 74 | `currentPeriodEndSeconds * 1000` |
| `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` | 56 | `session.expires_at * 1000` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 214 | `/ 1000` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | 39 | `/ 1000` |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | 231 | `currentPeriodEndSeconds * 1000` |

Additionally, the two named constants have **different names** for the same value (`MS_PER_SECOND` vs `SECOND_MS`), which is itself inconsistent.

**Risk:** Low. `* 1000` for timestamp conversions is idiomatic and readable. The inconsistency between constant names is the real issue.

---

### F7: Minor Magic Numbers — LOW

| File | Line | Value | Meaning |
|------|------|-------|---------|
| `app/(app)/app/practice/hooks/bookmark-message-timeout.ts` | 22 | `?? 2000` | Default toast auto-dismiss delay (ms) |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | 45 | `< 2` | Max bookmark retry attempts |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | 52 | `1000 * (count + 1)` | Retry backoff base (ms) — raw `1000` |
| `app/(app)/app/practice/practice-page-available-count.ts` | 19 | `= 200` | Debounce delay (ms) |

---

## Severity Assessment

| ID | Category | Instances | Severity | Risk |
|----|----------|-----------|----------|------|
| F1 | Retry config duplication | 4 definitions | **High** | Policy drift across Stripe/Clerk gateways |
| F2 | Timeout constant duplication | 19 definitions (12 × 10s + 7 × 15s) | **High** | Timeout tier policy is implicit and fragile |
| F3 | HTTP status codes raw | 24 instances | **Medium** | Readability; low functional risk |
| F4 | STACK_TRACE_LIMIT duplication | 2 definitions | **Medium** | Easy to fix, moderate inconsistency |
| F5 | DAY_MS duplication | 4 instances | **Medium** | Canonical export exists but isn't used |
| F6 | Raw ms↔s conversions | 5 instances + naming split | **Low** | Idiomatic but inconsistent with named constants |
| F7 | Minor magic numbers | 4 instances | **Low** | Localized, unlikely to drift |

---

## Proposed Fix (Sketch)

### Phase 1: Shared constants extraction

1. **`src/adapters/shared/retry-defaults.ts`** — Single `DEFAULT_RETRY_OPTIONS` constant. All four retry sites import it. Files that need `shouldRetry` override via spread.

2. **`app/(app)/app/shared/timeout-constants.ts`** — Two named tiers:
   ```
   STANDARD_READ_TIMEOUT_MS = 10_000
   STANDARD_MUTATION_TIMEOUT_MS = 15_000
   ```
   All 19 timeout constants become imports. Per-feature naming (`BOOKMARKS_LOAD_TIMEOUT_MS`) is replaced by the shared tier constant, since the value is uniform and the feature name adds no information.

3. **`src/adapters/shared/http-status.ts`** — Named HTTP status codes (`HTTP_OK`, `HTTP_BAD_REQUEST`, `HTTP_UNAUTHORIZED`, `HTTP_RATE_LIMITED`, `HTTP_INTERNAL_ERROR`, `HTTP_SERVICE_UNAVAILABLE`). Route handlers import instead of raw numbers.

4. **`src/adapters/shared/error-logging.ts`** (or add to existing shared file) — Single `STACK_TRACE_LIMIT = 1000`. Both webhook controllers import it.

### Phase 2: Consolidate time constants

5. **Promote `DAY_MS`** — `stripe-webhook-controller.ts` and `with-idempotency.ts` import from `src/domain/services/statistics.ts` (or extract to a new `src/domain/constants/time.ts` if the domain layer should own it).

6. **Unify ms↔s constant name** — Pick one (`MS_PER_SECOND`) and use it everywhere. Remove `SECOND_MS` alias.

### Phase 3: Minor cleanup

7. Extract `BOOKMARK_MESSAGE_CLEAR_DELAY_MS = 2000` and `MAX_BOOKMARK_RETRY_ATTEMPTS = 2` as named constants in their respective files.

---

## Open Questions

| # | Question | Context |
|---|----------|---------|
| 1 | **Should timeout constants use per-feature names or shared tier names?** | Per-feature names (`BOOKMARKS_LOAD_TIMEOUT_MS`) are more grep-friendly but create 19 constants for 2 values. Shared tier names (`STANDARD_READ_TIMEOUT_MS`) are DRY but lose the feature context at the call site. |
| 2 | **Are the retry configs intentionally identical or coincidentally identical?** | All four use `maxAttempts: 3, initialDelayMs: 100, factor: 2, maxDelayMs: 1000`. If Clerk should have different retry behavior than Stripe, sharing a constant would mask that. |
| 3 | **Is HTTP status constant extraction worth the import noise?** | Every route handler would gain an import line. Raw `200`, `400`, `500` are arguably self-documenting for experienced developers. The win is consistency with the codebase's otherwise thorough constant discipline. |
| 4 | **Should `DAY_MS` stay in the domain layer or move to a shared constants file?** | Currently lives in `src/domain/services/statistics.ts`. Adapter-layer files importing from domain is fine (dependency direction is inward), but a pure time constant feels more like infrastructure than domain logic. |
| 5 | **Should the `PRUNE_BATCH_LIMIT = 100` values (in `with-idempotency.ts` and `stripe-webhook-controller.ts`) reference `MAX_PAGINATION_LIMIT` or remain separate?** | They're semantically different (prune batch size vs. API pagination cap) but coincidentally the same number. Linking them means changing pagination also changes prune behavior. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-17 | Created BS-056 | Proactive debt audit identified 6 categories of constant duplication / magic number inconsistency |
