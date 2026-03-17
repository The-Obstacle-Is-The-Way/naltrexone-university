# BS-056: Magic Numbers, Hard-Coded Literals, and Constant Duplication Audit

**Date:** 2026-03-17
**Triggered by:** Proactive codebase-wide debt sweep for hard-coded values, magic numbers, and duplicated constant definitions.
**Scope:** Runtime TypeScript in `app/`, `src/`, `components/`, and `lib/`, plus production-adjacent helper modules when they duplicate canonical runtime constants. Excludes `docs/`, generated files, `db/migrations/`, CSS/Tailwind numeric tokens, marketing copy/content numerals, fixtures, and test-only timeout values in unit/E2E suites.
**Related:** None (first audit of this category)

---

## The Problem

The codebase is generally disciplined about constants. Routes are centralized in `lib/routes.ts`, validation limits live in `src/adapters/shared/validation-limits.ts`, and rate limits live in `src/adapters/shared/rate-limits.ts`.

The remaining debt is narrower and more specific: **eight categories** where raw literals survive beside existing shared constants, or where the same constant policy is redefined in multiple files. Most of this is not functional breakage. It is maintainability debt that makes policy changes harder than they need to be.

The main risk is not "someone used a number." The main risk is **policy drift**:

- Retry defaults change in one Stripe path but not another.
- A timeout tier moves from `10_000` to `12_000` in one feature slice and nowhere else.
- A pagination cap or Stripe list limit stays anonymous, so the next caller copy-pastes `100` again.

---

## Root Cause Analysis

- The repo already has strong owners for some shared literals (`routes`, `rate-limits`, `validation-limits`), but there is **no equivalent owner** for retry defaults, UI timeout tiers, HTTP status constants, or basic time primitives.
- Feature-slice app code added local `withTimeout(...)` wrappers independently, which produced many same-valued constants with different local names.
- Stripe and Clerk adapter code converged on identical retry behavior without a shared default object.
- Some same-valued constants are only **coincidentally equal**. That creates a second risk: over-normalizing unrelated `100` or `1000` values into one shared constant when the semantics are different.

---

## Findings

### F1: Retry Configuration Duplication — HIGH

The identical retry config `{ maxAttempts: 3, initialDelayMs: 100, factor: 2, maxDelayMs: 1000 }` is defined **four times in four files**:

| File | Line | Form |
|------|------|------|
| `src/adapters/gateways/stripe/stripe-retry.ts` | 4–9 | `const STRIPE_RETRY_OPTIONS = { ... } as const` |
| `src/adapters/gateways/stripe-subscription-canceler.ts` | 26–31 | `const STRIPE_RETRY_OPTIONS = { ... } as const` |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | 25–30 | `const STRIPE_RETRY_OPTIONS = { ... } as const` |
| `src/adapters/gateways/clerk-auth-gateway.ts` | 49–52 | Inline raw values in `retry()` call |

**Risk:** Retry policy can drift across Stripe and Clerk callers even though the current behavior is intentionally identical.

---

### F2: Duplicated Timeout Constants (10s and 15s tiers) — HIGH

**12 separate `= 10_000` constants**, all representing the same "standard read / lookup timeout" tier:

| File | Line | Constant Name |
|------|------|---------------|
| `app/(app)/app/practice/practice-page-bookmarks.ts` | 5 | `BOOKMARKS_LOAD_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-tags.ts` | 5 | `TAGS_LOAD_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-available-count.ts` | 9 | `AVAILABLE_COUNT_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-incomplete-session.ts` | 9 | `INCOMPLETE_SESSION_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 28 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` | 19 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` | 24 | `MARK_FOR_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/history/hooks/use-history-sessions.ts` | 20 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/shared/bookmark-toggle.ts` | 5 | `TOGGLE_BOOKMARK_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 18 | `PREVIOUS_ATTEMPT_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | 41 | `SESSION_REVIEW_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | 42 | `BOOKMARK_LOOKUP_TIMEOUT_MS` |

**7 separate `= 15_000` constants**, all representing the same "longer mutation / critical action timeout" tier:

| File | Line | Constant Name |
|------|------|---------------|
| `app/(app)/app/practice/practice-page-session-start.ts` | 11 | `SESSION_START_TIMEOUT_MS` |
| `app/(app)/app/practice/practice-page-incomplete-session.ts` | 10 | `ABANDON_SESSION_TIMEOUT_MS` |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 27 | `END_SESSION_TIMEOUT_MS` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | 10 | `LOAD_QUESTION_TIMEOUT_MS` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | 11 | `SUBMIT_ANSWER_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 16 | `QUESTION_LOAD_TIMEOUT_MS` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 17 | `ANSWER_SUBMIT_TIMEOUT_MS` |

**Risk:** The codebase already behaves as if two timeout tiers exist, but the tier policy is implicit instead of owned.

---

### F3: Raw `100` Limits with Better Owners Available — MEDIUM

Three `100` literals remain inline even though each one has a clearer semantic owner than "anonymous number":

| File | Line | Literal | Better Owner |
|------|------|---------|--------------|
| `app/(app)/app/history/history-search-params.ts` | 48 | `Math.min(..., 100)` | `MAX_PAGINATION_LIMIT` from `src/adapters/shared/validation-limits.ts` |
| `app/api/cron/reconcile-stripe-subscriptions/route.ts` | 126 | `parseNonNegativeInt(..., 100)` | Exported reconcile default limit or route-local named constant |
| `src/adapters/gateways/stripe-subscription-canceler.ts` | 41 | `limit: 100` | Stripe-specific list limit constant |

**Risk:** Same-valued operational limits are currently mixed together. One is clearly pagination, two are Stripe/cron operational bounds, and the code does not make that distinction explicit.

---

### F4: HTTP Status Codes as Raw Literals — MEDIUM

There are **25 raw HTTP status code usages**:

- **22** in route handlers
- **3** in `src/adapters/shared/retry.ts`

| File | Raw Codes Used |
|------|----------------|
| `app/api/stripe/webhook/handler.ts` | `400`, `429`, `503`, `200`, `400`, `500` |
| `app/api/cron/reconcile-stripe-subscriptions/route.ts` | `401` ×3, `429`, `503`, `500`, `200` |
| `app/api/webhooks/clerk/handler.ts` | `429`, `503`, `400` ×2, `200`, `500` |
| `app/api/health/handler.ts` | `429`, `503`, `500` |
| `src/adapters/shared/retry.ts` | `429`, `500`, `600` boundary check |

No shared HTTP status constants file exists.

**Risk:** Low functional risk, medium consistency/readability risk. `status: 503` is correct, but less self-documenting than a named constant. This is a lower-ROI cleanup than F1-F3.

---

### F5: Duplicated Cross-File Constants (`STACK_TRACE_LIMIT`, `PRUNE_BATCH_LIMIT`) — MEDIUM

Two named constants are defined identically in multiple files:

**`STACK_TRACE_LIMIT = 1000`** — defined in two webhook controllers:

| File | Line |
|------|------|
| `src/adapters/controllers/stripe-webhook-controller.ts` | 32 |
| `src/adapters/controllers/clerk-webhook-controller.ts` | 141 |

Both use it for stack truncation in error logging.

**`PRUNE_BATCH_LIMIT = 100`** — defined in two adapter modules:

| File | Line |
|------|------|
| `src/adapters/shared/with-idempotency.ts` | 13 |
| `src/adapters/gateways/drizzle-rate-limiter.ts` | 15 |

Both use it to cap best-effort cleanup queries (idempotency key pruning and rate-limit window pruning respectively). Same name, same value, same semantic purpose.

**Risk:** Small surface area, but these are clean cross-file duplications with a single meaning per constant. If either pruning or truncation policy changes, the other file silently drifts.

---

### F6: 24-Hour / Day Constants Are Duplicated or Re-encoded — MEDIUM

The codebase has a canonical runtime day constant:

| File | Line | Form |
|------|------|------|
| `src/domain/services/statistics.ts` | 1 | `export const DAY_MS = 86_400_000` |

But the same concept is still reintroduced elsewhere:

| File | Line | Form |
|------|------|------|
| `src/adapters/shared/with-idempotency.ts` | 9 | `const DEFAULT_TTL_MS = 86_400_000` |
| `src/adapters/controllers/stripe-webhook-controller.ts` | 33 | `90 * 86_400_000` |
| `src/domain/test-helpers/factories.ts` | 123 | `+ 86_400_000` |
| `src/application/use-cases/submit-answer.ts` | 44 | `SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS = 86_400` |

Important nuance: `src/adapters/shared/validation-limits.ts` already re-exports the submit-answer cap as `MAX_TIME_SPENT_SECONDS`, so the remaining debt is not "missing adapter exposure." The remaining debt is that basic time primitives do not have a clear single owner outside `statistics.ts`.

**Risk:** A time primitive already exists, but its home (`statistics.ts`) is not an obvious place for adapter-layer imports, so callers keep re-encoding "24 hours" locally.

---

### F7: Raw Millisecond ↔ Second Conversions and Split Constant Naming — LOW

Named constants exist, but they are inconsistent:

| File | Line | Constant |
|------|------|----------|
| `src/domain/services/session-stats.ts` | 8 | `MS_PER_SECOND = 1000` |
| `src/adapters/gateways/drizzle-rate-limiter.ts` | 13 | `SECOND_MS = 1000` |

At the same time, five runtime files still use raw `* 1000` or `/ 1000` conversions:

| File | Line | Expression |
|------|------|------------|
| `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts` | 74 | `currentPeriodEndSeconds * 1000` |
| `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` | 56 | `session.expires_at * 1000` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 214 | `/ 1000` |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | 39 | `/ 1000` |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | 231 | `currentPeriodEndSeconds * 1000` |

**Risk:** Low. Raw timestamp conversion is idiomatic. The bigger issue is that two different constant names already exist for the same value.

---

### F8: Minor Anonymous UI / Client Timing Values — LOW

These are localized and low-risk, but still count as unnamed policy values:

| File | Line | Value | Meaning |
|------|------|-------|---------|
| `app/(app)/app/practice/hooks/bookmark-message-timeout.ts` | 22 | `?? 2000` | Bookmark toast auto-clear delay |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | 45 | `< 2` | Max retry attempts |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | 52 | `1000 * (count + 1)` | Retry backoff base |
| `app/(app)/app/practice/practice-page-available-count.ts` | 19 | `= 200` | Debounce delay |
| `components/ui/notification-provider.tsx` | 81 | `durationMs = 2500` | Default app toast duration |

**Risk:** Localized and easy to change, but these are still policy defaults hiding in implementation sites.

---

## Non-Findings / Explicit Exclusions

- **Routes are mostly centralized correctly.** Raw route literals were limited to route matcher files and route self-identification strings such as `const ROUTE = '/api/cron/reconcile-stripe-subscriptions'`.
- **Validation and rate-limit configs are already centralized.** This audit did not count named one-owner constants like `MAX_PRACTICE_SESSION_QUESTIONS`, `ONE_MINUTE_MS`, or `HEALTH_CHECK_RATE_LIMIT`.
- **Named one-off limits were not counted as debt.** Examples: `MAX_HISTORY_SEQUENCE_LENGTH`, `MAX_SLUG_LENGTH`, `MAX_DISPLAY_DURATION_MINUTES`, `SESSION_ATTEMPT_READ_LIMIT`.
- **Repeated shallow response copy was not counted.** Strings like `'Too many requests'`, `'Rate limiter unavailable'`, and `'Webhook processing failed'` repeat across handlers, but centralizing them would add indirection with little payoff.
- **Test-only timeout duplication was excluded.** `tests/e2e/**` contains many repeated `10_000`, `15_000`, and `60_000` values, but that is better handled as a separate testing-infrastructure audit.

---

## Severity Assessment

| ID | Category | Instances | Severity | Risk |
|----|----------|-----------|----------|------|
| F1 | Retry config duplication | 4 definitions | **High** | Policy drift across Stripe/Clerk retry paths |
| F2 | Timeout constant duplication | 19 definitions | **High** | Timeout tiers exist implicitly but are not owned |
| F3 | Raw `100` limits | 3 instances | **Medium** | Anonymous operational bounds; one should use existing pagination cap |
| F4 | Raw HTTP status codes | 25 instances | **Medium** | Readability and consistency, low functional risk |
| F5 | Cross-file constant duplication (`STACK_TRACE_LIMIT`, `PRUNE_BATCH_LIMIT`) | 4 definitions (2+2) | **Medium** | Clean duplication; policy drift if one changes without the other |
| F6 | 24-hour/day constant duplication | 4 non-canonical occurrences | **Medium** | Basic time primitives lack an obvious shared owner |
| F7 | Raw ms↔s conversions + split naming | 5 raw conversions + 2 names | **Low** | Mostly stylistic unless naming remains split |
| F8 | Minor anonymous UI/client timings | 5 instances | **Low** | Localized policy defaults hiding inline |

---

## Proposed Fix (Sketch)

### Phase 1: High-signal, low-risk deduplication

1. **Extract retry defaults**

   Add a shared constant in `src/adapters/shared/` for:

   ```ts
   {
     maxAttempts: 3,
     initialDelayMs: 100,
     factor: 2,
     maxDelayMs: 1000,
   }
   ```

   Keep `shouldRetry` and `onRetry` at the call site.

2. **Introduce explicit timeout tiers**

   Add a shared app-level timeout owner, for example:

   ```ts
   export const STANDARD_READ_TIMEOUT_MS = 10_000;
   export const STANDARD_MUTATION_TIMEOUT_MS = 15_000;
   ```

   Prefer either:

   - direct imports at the call site, or
   - local aliases such as `const BOOKMARKS_LOAD_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS`

   The second option preserves grep-friendly names while still centralizing the values.

3. **Fix the raw `100`s by semantic owner, not by shared value alone**

   - `parseLimit(...)` in history should import `MAX_PAGINATION_LIMIT`
   - reconcile route should reference an exported reconcile default limit or a clearly named route constant
   - Stripe canceler should introduce a Stripe-specific list limit constant

   Do **not** tie prune batch sizes or Stripe list limits to `MAX_PAGINATION_LIMIT` just because the current number matches.

4. **Share `STACK_TRACE_LIMIT` and `PRUNE_BATCH_LIMIT`**

   Move `STACK_TRACE_LIMIT` into a small shared error-logging module and import it from both webhook controllers. Move `PRUNE_BATCH_LIMIT` into `src/adapters/shared/` and import it from both `with-idempotency.ts` and `drizzle-rate-limiter.ts`.

### Phase 2: Give basic time primitives a clean home

5. **Create a dedicated time-constants module**

   Move or re-home primitives such as:

   - `DAY_MS`
   - `MS_PER_SECOND`
   - optionally `SECONDS_PER_DAY`

   This avoids importing base time constants from `statistics.ts`, which is a reasonable source file for behavior but an awkward source file for generic primitives.

6. **Normalize only the conversions that improve clarity**

   - App-side elapsed-time math likely benefits from a shared `MS_PER_SECOND`
   - Stripe timestamp adapters may remain raw `* 1000` if the team prefers idiomatic vendor-field conversion over extra indirection

### Phase 3: Optional readability cleanup

7. **Decide whether HTTP status extraction is worth it**

   This is the lowest-ROI medium finding. If the team wants stronger consistency, add a small `http-status.ts`; otherwise leave raw status codes alone and focus on F1-F6.

8. **Name the local UI/client timing defaults**

   Add small file-local constants for the bookmark toast, notification duration, retry count, retry backoff base, and debounce delay where doing so improves readability.

---

## Open Questions

| # | Question | Context |
|---|----------|---------|
| 1 | **Should timeout tiers be imported directly, or aliased locally for readability?** | Direct imports maximize DRY. Local aliases preserve feature intent at the call site. |
| 2 | **Are Clerk and Stripe retry defaults intentionally coupled long-term?** | They are identical today. A shared default is correct only if that identity is deliberate. |
| 3 | **Is HTTP status extraction worth the import noise?** | This is a consistency win, not a correctness win. |
| 4 | **Where should base time primitives live?** | A dedicated constants module is cleaner than importing `DAY_MS` from `statistics.ts`, but either approach is valid if dependency direction stays inward. |
| 5 | **Should test-only timeout duplication be audited separately?** | `tests/e2e/**` has many repeated timeout values, but it follows a different policy surface than runtime app/adapters code. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-17 | Created BS-056 | Proactive debt audit identified 8 categories of constant duplication / magic number inconsistency |
| 2026-03-17 | Corrected F4 count and expanded F5 | F4: retry.ts has 3 raw status literals (429, 500, 600), not 2 — total is 25, not 24. F5: added `PRUNE_BATCH_LIMIT = 100` duplication across `with-idempotency.ts` and `drizzle-rate-limiter.ts` (same pattern as `STACK_TRACE_LIMIT`). |
