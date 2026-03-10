# Bug Reports

**Project:** Naltrexone University
**Last Updated:** 2026-03-10

---

## What are Bug Reports?

Bug reports document issues discovered in the codebase along with their root cause, fix, and verification. They serve as:

1. **Issue Tracking** — Formal record of what went wrong and how it was fixed
2. **Regression Prevention** — Ensure we don't reintroduce the same bugs
3. **Knowledge Base** — Help future developers understand past issues

**Next Bug ID:** BUG-206

**Latest archival (2026-03-10):**
- BUG-204 verified fixed (PR #193): rate limiting and idempotency added to portal session creation, archived to `docs/_archive/bugs/`.
- BUG-203 invalidated after package-level tracer-bullet verification of Clerk `verifyWebhook()`, archived to `docs/_archive/bugs/`.

**Previous archival (2026-03-09):**
- BUG-199 invalidated after tracer-bullet verification, archived to `docs/_archive/bugs/`.
- BUG-200 reclassified as DEBT-286, archived to `docs/_archive/bugs/`.
- BUG-201 and BUG-202 verified fixed (commit `a8ce087c`), archived to `docs/_archive/bugs/`.

**Earlier archival (2026-03-03):**
- BUG-186, BUG-187, BUG-188 verified fixed (PR #164), archived to `docs/_archive/bugs/`.
- BUG-189, BUG-190, BUG-191 verified fixed (PR #166), archived to `docs/_archive/bugs/`.
- BUG-192, BUG-193, BUG-194 verified fixed (PR #165), archived to `docs/_archive/bugs/`.
- BUG-195, BUG-196, BUG-197, BUG-198 verified fixed (PR #167), archived to `docs/_archive/bugs/`.

**Earlier archival (2026-03-02):**
- BUG-182, BUG-183, and BUG-184 verified fixed (PR #163), archived to `docs/_archive/bugs/`.
- BUG-180, BUG-181, and BUG-185 verified fixed (PR #162), archived to `docs/_archive/bugs/`.
- Audit #8: all 12 bugs (BUG-167..179, excluding false-positive BUG-174) verified fixed, archived to `docs/_archive/audits/audit-008-deep-codebase-sweep.md`.
- BUG-165 and BUG-166 verified fixed (PRs #146, #147), archived to `docs/_archive/bugs/`.
- BUG-160 through BUG-164 verified fixed, merged (PR #144), and archived to `docs/_archive/bugs/`.

## Open Bugs

| Bug | Priority | Summary |
|-----|----------|---------|
| [BUG-205](./bug-205-reconciliation-prefers-stale-local-subscription-over-canonical-stripe-state.md) | P1 | Stripe reconciliation keeps a stale local subscription as canonical and can cancel the longer-lived Stripe subscription |

## Audit #14 — Boundary Sweep: Reconciliation Canonical Selection (2026-03-10)

Focused follow-up sweep on boundary-heavy billing and domain paths after the BUG-204 verification work. The goal was to find only non-duplicate, code-trace-confirmed bugs with realistic impact.

**Methodology:**
- Full-file review of reconciliation job logic, Stripe normalization, cron entrypoint, and adjacent tests.
- Cross-check against archived reconciliation bugs and debt items to avoid refiling known issues.
- Targeted verification run: `pnpm test --run src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`

**1 new bug filed (BUG-205):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-205 | Billing / reconciliation | P1 | Reconciliation short-circuits canonical selection to the stale local subscription and may cancel the actual Stripe winner |

## Audit #13 — Adversarial Security Re-Verification (2026-03-10)

Follow-up adversarial audit focused on server actions, authorization boundaries, webhook verification, rate limiting, configuration, and transaction/race behavior. Every candidate finding was re-verified against the current code and cross-checked against archived bug/debt history before filing.

**Methodology:**
- Full-file review of all server-action/controller entry points, webhook routes, env validation, billing flows, schema/migrations, and key domain services.
- Tracer-bullet traces from public entry points through controllers/use cases into repositories or Stripe gateways.
- Targeted verification run: `pnpm test --run lib/env.test.ts app/api/webhooks/clerk/route.test.ts src/adapters/controllers/billing-controller.test.ts app/api/cron/reconcile-stripe-subscriptions/route.test.ts`
- Prior audit/debt register cross-check to avoid refiling archived issues or known false positives.

**1 new bug filed (BUG-204):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-204 | Authenticated abuse / billing | P3 | Billing portal creation lacks rate limiting and blocks callers from supplying the idempotency key already supported by the application port |

**1 bug invalidated after deeper runtime verification:**
- BUG-203 was initially filed, then invalidated after inspecting the installed `@clerk/nextjs` and `@clerk/backend` runtime. `verifyWebhook()` reads `process.env.CLERK_WEBHOOK_SIGNING_SECRET` directly and fails closed when that env var is missing; our typed `env` fallback is not consulted by the Clerk SDK.

**Candidate findings rejected after re-verification:**
- Cron weak-secret guessing path was not filed as a bug because exploitation depends on operators choosing a weak `CRON_SECRET`; the code should be hardened, but the current evidence is too deployment-dependent for a bug filing.
- The remove-bookmark double-submit race was not re-filed because it collapses to the previously rejected last-write-wins bookmark-toggle race family.

## Audit #12 — Extended Sweep: Inference Leaks, Transaction Safety, Zombie Keys (2026-03-03)

Follow-up sweep after Audit #11, targeting three additional families: indirect exam secrecy leaks (inference via count deltas), transaction boundary violations, and idempotency edge cases.

**Methodology:**
- 3 parallel agents: (1) exhaustive exam secrecy re-sweep across all remaining surfaces, (2) async race condition sweep across all hooks/effects, (3) data integrity audit covering CAS, transactions, idempotency, type safety, error handling, boundary violations.
- Every finding manually verified at the line level before filing.

**4 new bugs filed (BUG-195..198):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-195 | Exam secrecy (inference) | P3 | `latestAttemptRowsSubquery` in question repo has no active-exam exclusion — count delta reveals correctness |
| BUG-196 | Race condition | P3 | `loadReview` has no concurrency guard — double-click fires duplicate `finalizeSession` |
| BUG-197 | Transaction safety | P2 | `SubmitAnswer` does attempt insert + session state update without a DB transaction — orphan risk on failure |
| BUG-198 | Idempotency | P3 | Claimed-but-never-completed idempotency key becomes 24-hour zombie blocking retries |

**Surfaces confirmed clean:**
- All other use cases returning correctness data (audit exhaustive — see Audit #11 matrix)
- All hooks with proper `mounted` + cleanup patterns (bookmarks, tags, incomplete session, available counts, navigator, summary review, mark-for-review)
- Domain layer boundary purity (zero external imports)
- SQL injection (all Drizzle parameterized queries, one validated string interpolation in Stripe search)
- Error handling (no silent swallowing of business-critical errors)

---

## Audit #11 — Exam Secrecy Deep Sweep + Race Condition Audit (2026-03-03)

Adversarial verification of BUG-186 through BUG-190 (filed by a prior agent), followed by a comprehensive sweep for additional exam secrecy violations and async race conditions across all layers.

**Methodology:**
- Tracer-bullet code trace for each claimed bug (verified at the line level)
- Cross-layer exam secrecy audit: every use case returning `isCorrect` checked for active-exam gating
- Async race condition sweep: every `useEffect` firing async operations checked for stale-request guards
- CAS pattern audit: normalization vs DB comparison verification
- `Promise.all` snapshot consistency audit under READ COMMITTED isolation

**5 prior bugs verified (BUG-186..190):** All confirmed real with enhanced documentation.
**4 new bugs filed (BUG-191..194):** 2 exam secrecy violations, 1 history page leakage, 1 async race condition.

### Exam Secrecy Violation Summary

The codebase has a systemic pattern: `shouldShowExplanation(session)` gates explanations and correctChoiceId, but `isCorrect`/`latestIsCorrect` is returned unconditionally. Affected use cases:

| Use Case | Field | Gated? | Bug |
|----------|-------|--------|-----|
| `GetPracticeSessionReview` | `isCorrect` | No | BUG-186 |
| `GetUserStats` (counts) | aggregate counts | No | BUG-187 |
| `GetNextQuestion` | `latestIsCorrect` | No | BUG-191 |
| `GetAttemptedQuestions` | `isCorrect` | Yes (BUG-192 fix: active-exam rows excluded at repository) | Fixed |
| `SubmitAnswer` | `isCorrect` | Yes (BUG-193 fix: gated behind `shouldShowExplanation`) | Fixed |
| `GetPreviousAttempt` | `isCorrect` | Yes (BUG-180 fix) | Fixed |

### Race Condition Summary

| Surface | Guard Pattern | Status | Bug |
|---------|--------------|--------|-----|
| `runLoadQuestionFlow` | `isMounted()` + `isLatestRequest()` | Correct | — |
| `runSubmitAnswerFlow` | `isMounted()` + `isLatestRequest()` | Correct (BUG-194 fix) | Fixed |
| `useQuestionPageController` (load) | `isMounted()` only, no cleanup | Missing guard | BUG-189 |
| `useQuestionPageController` (hydrate) | `isMounted()` only | Missing guard | BUG-189 |
| `useQuestionPageController` (session nav) | `isStale` cleanup | Correct | — |
| `useHistorySessions` | sessionId token | Reopen race | BUG-190 |

## Audit #10 — Exam Secrecy and Cross-Layer Invariant Sweep (2026-03-02)

Policy-driven investigation targeting exam-answer secrecy invariant enforcement across use cases, controllers, repository projections, and retry/review surfaces. Each finding was verified with executable repro harnesses and full tracer-bullet traces.

**6 new confirmed bugs filed:** BUG-180 (P1), BUG-181 (P1), BUG-182 (P2), BUG-183 (P2), BUG-184 (P2), BUG-185 (P1).

- BUG-180, BUG-181, BUG-185 form a family: active-exam correctness/explanation exposure via review hydration, retry provenance, and dashboard projection.
- BUG-182 is an independent input-normalization crash (repeated query params).
- BUG-183 is an independent transaction-rollback issue (Stripe webhook failure state lost).
- BUG-184 is an independent race condition (concurrent count/page divergence).

Canonical policy established: [Exam Answer Secrecy Policy](../practice-engine/exam-answer-secrecy-policy.md).

---

## Audit #7 — Deep Sweep for First-Principles, Silent-Drop, and Relative Bugs (2026-02-27)

Five-axis investigation covering: (1) existing bug documentation and audit history, (2) domain layer entities and business logic, (3) application use cases and error handling, (4) adapters, server actions, and wiring, and (5) frontend components, race conditions, and accessibility. Ran 5 parallel exploration agents, then **manually verified every finding** against previous audit false-positive records and the actual code with full tracer-bullet traces.

**2 new confirmed bugs filed:** BUG-165 (P3), BUG-166 (P3). Both underwent full tracer-bullet verification — **double-verified** with a second pass of 4 parallel exploration agents (adapters, frontend, domain/application, lib/config) plus manual code reading of every finding.

### Tracer-Bullet Verification (2026-02-27)

The traces below capture the pre-fix code state at discovery time during Audit #7.

**BUG-165 — Full vertical + horizontal trace (12-step):**
1. `app/(app)/app/billing/manage-billing-actions.ts` → server action entry point (`'use server'`)
2. → `manage-billing-action.ts` → `runManageBillingActionCore` with `{ failure: '/app/billing?error=portal_failed' }` (NO `unauthenticated` key)
3. → `manage-billing-core.ts` `runManageBillingAction` → calls `deps.createPortalSessionFn({})`
4. → `billing-controller.ts` `createPortalSession` → `d.authGateway.requireUser()`
5. → `clerk-auth-gateway.ts` line 78: throws `ApplicationError('UNAUTHENTICATED', 'User not authenticated')`
6. → `create-action.ts` line 44-46: catches → `handleError()` → `err('UNAUTHENTICATED', ...)`
7. → back to `manage-billing-core.ts` line 30: `result.ok` is false
8. → line 33: `getManageBillingErrorRedirect('UNAUTHENTICATED', deps.redirects)`
9. → line 12: `errorCode === 'UNAUTHENTICATED'` is true, BUT `redirects.unauthenticated` is `undefined`
10. → line 16: falls back to `redirects.failure` → `/app/billing?error=portal_failed`
11. User sees error banner instead of sign-in redirect
- **Horizontal comparison:** `app/pricing/manage-billing-action.ts` provides `unauthenticated: ROUTES.SIGN_UP` (line 16) — app billing does not
- **Type trace:** `ManageBillingRedirects.unauthenticated` is optional (`string?`) — type system does not enforce it
- **Test trace:** Pricing page tests UNAUTHENTICATED → `/sign-up` ✓; App billing tests have NO UNAUTHENTICATED test case (the bug is untested)
- **Core test:** `manage-billing-core.test.ts` line 73-79 tests the fallback path (when unauthenticated is not configured) — validates the bug behavior EXISTS

**BUG-166 — Full vertical trace (catch-block anatomy):**
1. `manage-billing-core.ts` lines 25-29: `catch {` — no error parameter binding
2. Both `manage-billing-action.ts` files (app billing AND pricing) call this core function — both are affected
3. `createPortalSessionFn` is `billing-controller.ts` `createPortalSession` wrapped by `createAction` — should NOT throw (returns `ActionResult`)
4. Catch block defends against: container load failures (`loadAppContainer` dynamic import fails), JavaScript runtime errors, unexpected `createPortalSessionFn` implementations
5. Impact: Even rare errors (container wiring, module resolution, unexpected Stripe SDK errors that bypass `createAction`) are permanently lost — zero server-side record
6. The catch block has no error parameter, no logging, no monitoring — immediate redirect to failure URL

### Findings Confirmed as NOT Bugs (27 False Positives)

**Re-verified from previous audits (already documented):**
- Session history pagination total (DB `isNotNull(endedAt)` filters both COUNT and ROWS — Audits #3, #4)
- `StartPracticeSession` count/mode validation (Zod schema enforces at controller — Audit #3)
- Bookmark toggle race condition (handled by `onConflictDoUpdate` — Audit #4)
- `loadPreviousAttempt` silent catch (intentional best-effort design — Audit #4)
- `paymentProcessing` excluded from `EntitledStatuses` (intentional — BUG-077)
- DB singleton `NODE_ENV` caching pattern (standard Next.js HMR pattern — Audit #3; in production modules are cached by Node.js)

**New false positives verified this audit:**
- `SetPracticeSessionQuestionMark` missing question-in-session validation (FALSE — `practice-session-question-state-updater.ts` lines 43-51 validates membership with `NOT_FOUND` error)
- `StartPracticeSession` missing `input.count` validation (FALSE — Zod schema `z.number().int().min(1).max(200)` at controller)
- `StartPracticeSession` missing `input.mode` validation (FALSE — `zPracticeMode` enum validation at controller)
- `GetSessionHistory` pagination broken by defensive filter (FALSE — DB already filters; `skippedCount` is always 0)
- `GetSessionHistory` "dead code" defensive filter (not a bug — legitimate defense-in-depth)
- `CreateCheckoutSession` missing email/URL validation (URLs constructed from internal `ROUTES` constants + `appUrl`; email from Clerk — system boundary already validated)
- `CreateCheckoutSession` wrong error code for missing clerkUserId (INTERNAL_ERROR is correct — null `clerkUserId` with valid `userId` indicates corrupted user data, not unauthenticated access)
- `GetPracticeSessionReviewUseCase` silent continue on null questionId (defensive guard for impossible `string[]` state)
- `GetPreviousAttemptUseCase` default sessions no-op parameter (intentional test ergonomics)
- `ToggleBookmarkUseCase` race condition (last-write-wins is acceptable; concurrent same-user bookmark is near-zero probability)
- `CountAvailableQuestions` missing filter validation (empty arrays are valid filters — "no filter applied")
- Domain test factory `86_400_000` magic number (correct value; importing `DAY_MS` would be cleaner but risk is zero — DAY_MS is a physical constant)
- Health check 503 on rate limiter failure (correct behavior — service unavailable)
- Idempotency prune silent catch (intentional — pruning must not block caller; logged as warning)
- Subscription price ID rotation strategy (architectural concern, not a runtime bug)
- `fireAndForget` without error UI (callers handle errors in `run()`; catch is safety net per Audit #4)
- `practice-session-page-view` conditional button rendering (correct gating on optional callback)
- Stripe checkout session retrieve failure leaves old session open (FALSE — intentional defensive design; old sessions auto-expire in 24h; attempting to expire an uninspectable session could be worse if user is mid-checkout; tested at `stripe-checkout-sessions.test.ts` line 443-463)
- `stripe-subscription-normalizer.ts` missing `.bind()` on `stripeSubscriptions` (FALSE — `stripeSubscriptions` is the namespace OBJECT, not an extracted method; `stripeSubscriptions.retrieve(...)` preserves `this` because the method is called ON the object. Compare with BUG-069/070 where `stripe.customers.search` was extracted as a standalone FUNCTION variable, losing `this`)
- `db.ts` connection not cached in production (FALSE — re-confirmed from Audit #3; standard Next.js pattern; in production, Node.js module caching ensures `conn` persists at module scope; `globalThis` caching is only needed for dev HMR which re-evaluates modules)
- Frontend layer clean — no new error handling gaps, race conditions, or accessibility issues found across all pages and components
- Domain layer clean — zero first-principles logic errors in scoring, grading, session state, entitlement, streak, or question selection

### Domain Layer Health

**Excellent.** Zero first-principles logic bugs. All scoring, grading, session state, entitlement, streak, and question selection logic verified correct. All domain value objects have proper validators with full test coverage. No `any` types, no unsafe assertions, no silent failures. Domain layer maintains zero external imports.

### Security Posture Re-Verified

- Three-layer auth enforcement intact: proxy.ts middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Webhook signatures verified (Stripe HMAC, Clerk Svix, cron timing-safe comparison)
- Rate limiting fail-closed on all public endpoints
- No magic numbers in security-critical paths
- No silently dropped IDs, configs, or variables in critical paths

---

## Audit #6 — Full-Stack Bug Sweep with 5 Parallel Agents (2026-02-25)

Five-axis investigation covering: (1) existing bug documentation review, (2) source code architecture and logic, (3) tests and configuration, (4) API routes, server actions, and webhooks, and (5) UI/UX and accessibility. Ran 5 parallel exploration agents, then **manually verified every finding** with full code traces.

**3 new confirmed bugs filed:** BUG-160 (P3), BUG-161 (P3), BUG-162 (P4). All 3 underwent full tracer-bullet verification.

### Tracer-Bullet Verification (2026-02-25)

All 3 bugs were traced end-to-end with vertical and horizontal tracer bullets:

- **BUG-160:** 6-layer vertical trace (DB → use case → controller → dashboard render → history page reference → test gap). Confirmed `firstQuestionSlug` and `sessionId` are fetched but unused. Correct pattern exists 70 lines below the bug in the same file's "Recent activity" section.
- **BUG-161:** 12+ file horizontal trace across webhook → normalizer → status mapper → DB → entitlement → layout → pricing page. Confirmed `paymentFailed` is routed through the same `payment_processing` reason path as `paymentProcessing`. Second affected path found in `checkout-success-sync.tsx:245`. Existing test at `check-entitlement.test.ts:120` encodes the bug as correct behavior.
- **BUG-162:** Vertical trace from controller → use case → repository port → Drizzle impl → Postgres. Horizontal trace across all 10 controller files confirmed this is the sole unbounded offset instance. SQL path involves `ROW_NUMBER()` window function making large offsets especially costly.

### Findings Confirmed as NOT Bugs (Initial Sweep — 10 False Positives)

- History session state persistence across pagination (correct UX — toggle deselects, `useHistorySessions` manages via refs)
- `GetPreviousAttemptUseCase` silent null return (already documented and fixed as BUG-139)
- Empty catch blocks (none found in codebase)
- Skipped tests (only E2E credential-gated skips, not logic gaps)
- TODO/FIXME/HACK markers (none found)
- Stale closure in practice controller (refs ARE the solution)
- `paymentProcessing` excluded from `EntitledStatuses` (intentional — BUG-077 resolved with specific messaging)
- Missing pricing error boundary (exists at `app/pricing/error.tsx`)
- Subscribe button missing disabled state (has `disabled={pending}`)
- Middleware naming false positive (Next.js 16 `proxy.ts` pattern, confirmed via build)

### Findings Confirmed as NOT Bugs (Deep Dive — 12 False Positives)

- Dashboard stats error handling (ErrorCard with retry renders correctly)
- Practice session CAS retry pattern (correct for optimistic concurrency)
- Session history drill-down toggle (correct accordion-style UX)
- Bookmark message timeout (cleanup on unmount already handled)
- Rate limiter fail-closed behavior (correct — denies on error)
- Webhook signature verification (Stripe HMAC verified before processing)
- Clerk webhook Svix verification (standard Clerk pattern)
- CSP header configuration (delegated to Clerk middleware correctly)
- Question selection randomization (Fisher-Yates shuffle, correct)
- Pagination total count consistency (filtered identically on COUNT and ROWS)
- Stripe customer search query safety (validated before interpolation, BUG-106 resolved)
- Idempotency key pruning (hot-path pruning wired, BUG-103/104 resolved)

### Security Posture Re-Verified

- Three-layer auth enforcement intact: middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Webhook signatures verified, rate limiting fail-closed
- Security headers (HSTS, X-Frame-Options, Permissions-Policy, X-Content-Type-Options) all configured

## Audit #5 — Six-Axis Codebase Bug Sweep (2026-02-22)

Six-axis investigation covering domain layer, application layer, adapters layer, frontend/UI, configuration/infrastructure, and test coverage. Ran 6 parallel exploration agents, then **manually verified every finding** with full code traces and a production build.

**2 new confirmed bugs filed:** BUG-148 (P3), BUG-149 (P3). Both were latent at discovery and are now resolved.

**Findings confirmed as NOT bugs after manual verification:**

- `proxy.ts` naming is "broken middleware" (FALSE — Next.js 16 recognizes `proxy.ts` as middleware; confirmed via `pnpm build` output: `ƒ Proxy (Middleware)`)
- AlertDialogAction missing `disabled` in incomplete session card (Radix auto-closes dialog on action click; trigger `disabled={isPending}` prevents re-open)
- AlertDialogAction missing `disabled` in bookmarks removal (auto-close + page revalidation removes bookmark from UI; no second trigger possible)
- Redundant `isPending` guard in ExamReviewView (code smell, not a bug; `disabled` attribute is sufficient)
- `createPracticeSession` factory allows mismatched `questionIds`/`questionStates` (test helper only; application layer handles defensively with warning logs; tested explicitly)
- Domain `PracticeSessionQuestionState` allows null fields together (intentional design for partial state)
- `QuestionProgressStatus` missing "correct" value (intentional design per domain model)
- `selectNextQuestionId` defensive null check (safe defensive programming)

**Test coverage observations (not bugs, but noted for improvement):**

- Cron auth token validation route handler lacks unit test (P1 coverage gap)
- `practice-session-params.ts` serialization layer untested (P2 coverage gap)
- `practice-session-question-state-updater.ts` retry logic untested (P2 coverage gap)
- No E2E test for subscription cancellation → entitlement denial (P1 coverage gap)
- No integration test for idempotency key persistence in billing flows (P1 coverage gap)

**Security posture confirmed solid (re-verified from Audit #4):**

- `proxy.ts` middleware running and applying Clerk auth + CSP headers
- Three-layer auth enforcement intact: middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Webhook signatures verified, rate limiting fail-closed
- Security headers (HSTS, X-Frame-Options, Permissions-Policy, X-Content-Type-Options) all configured

## Audit #4 — Middleware, Core Paths, and Security Deep Dive (2026-02-16)

Eight-axis investigation covering middleware consistency, auth enforcement, webhook security, data validation, error handling, question selection, Stripe subscription lifecycle, and data consistency edge cases. Ran 8 parallel exploration agents, then manually verified every finding through the actual code.

**1 new confirmed bug filed:** BUG-143 (same root cause as BUG-136 — `NODE_ENV` Turbopack inlining — but affecting Sentry environment tag).

**Findings confirmed as NOT bugs after tracer-bullet verification:**

- Practice session CAS retry without backoff (correct pattern for optimistic concurrency; immediate retry is optimal for short contention windows)
- Orphaned attempt on rollback failure (already resolved as DEBT-190)
- Practice session review missing question state (already resolved as DEBT-159)
- Cron endpoint 503 when CRON_SECRET missing (correct status — service unavailable, not unauthorized)
- Client `runTransitionedAsyncAction` error swallowing in prod (callers handle errors in `run()`; catch is a safety net, not primary handler)
- `pastDue` status granting entitlement (standard SaaS practice: grace period during Stripe payment retries)
- `cancelAtPeriodEnd` not checked in `isEntitled()` (correct Stripe convention: user paid through period end; status transitions to `canceled` naturally)
- Reconciliation job subscription selection heuristic (keeping longest-remaining subscription is correct deduplication strategy)
- History pagination total inconsistency (repository already filters `isNotNull(endedAt)` on both COUNT and ROWS — same finding as Audit #3)
- Bookmark toggle race condition (handled by `onConflictDoUpdate` conflict strategy)
- Webhook peek optimization race window (secondary `lock()` guard prevents double-processing)
- Cron error message information disclosure (minimal impact — reveals config name only, not secrets)

**Security posture confirmed solid across all axes:**

- Middleware applies consistently to all protected routes; no bypass patterns
- Three-layer auth enforcement: middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries properly scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Markdown rendering sanitized via `rehype-sanitize` + `skipHtml` (no XSS)
- Webhook signatures verified (Stripe HMAC, Clerk Svix, cron timing-safe comparison)
- Rate limiting on all public endpoints with fail-closed behavior
- CSP, HSTS, X-Frame-Options, Permissions-Policy all configured
- No redirect loops detected

## Audit #3 — Codebase-Wide Bug Sweep (2026-02-16)

Five-axis audit covering domain, application, adapters, frontend, and configuration layers. Ran 5 parallel exploration agents, then **triple-checked every finding** with full vertical/horizontal tracer-bullet traces through the actual code paths.

**14 agent-reported findings were confirmed as false positives** after manual code review:

- DB singleton `NODE_ENV` pattern (standard Next.js pattern, correct as-is)
- `mapWithConcurrencyLimit` race condition (JS is single-threaded; `nextIndex` access is atomic between await points)
- Idempotency key `lt(expiresAt, now())` "inverted" logic (correctly reclaims expired keys)
- Stripe SDK `.bind()` missing in canceler (method calls on objects bind `this` correctly)
- Question repo `or()` with empty array (guarded by `hasStatusFilter` check)
- Frontend stale closure in practice controller (refs ARE the solution, not the problem)
- Missing pricing `error.tsx` (it exists at `app/pricing/error.tsx`)
- Subscribe button missing `disabled` (already has `disabled={pending}` on line 17)
- `crypto.randomUUID()` missing fallback (supported in all modern browsers)
- `StartPracticeSession` count <= 0 (Zod schema enforces `min(1)`, UI clamps to `[1,100]`, output requires `min(1)`)
- Session history pagination total inaccurate (Drizzle repo filters `isNotNull(endedAt)` on both COUNT and ROWS)
- `paymentProcessing` excluded from `EntitledStatuses` (intentional design; BUG-077 resolved this with specific messaging; test coverage exists)
- `ports/use-cases.ts` incomplete (architectural preference with zero runtime impact)
- Container logger fallback bypasses redaction (unreachable code — no caller passes `undefined` logger; DEBT-088 resolved)

Audit #3 produced BUG-136 and BUG-139. BUG-137 was reclassified as SSOT-consistent. Audit #4 added BUG-143.

---

## Recently Triaged

| ID | Title | Status | Resolution |
|----|-------|--------|------------|
| [BUG-185](../_archive/bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md) | Dashboard Recent Activity Reveals Active Exam Correctness | Resolved | Added active-exam exclusion predicate in `listRecentByUserId` and repository regression coverage |
| [BUG-184](../_archive/bugs/bug-184-attempted-questions-count-page-divergence-drops-rows.md) | Attempted Questions Count/Page Divergence Can Drop Real Rows | Resolved | Removed `totalCount === 0` short-circuit, preserving non-empty page rows under count/list divergence; added regression assertion for row identity |
| [BUG-183](../_archive/bugs/bug-183-stripe-webhook-failure-state-rolled-back.md) | Stripe Webhook Failure State Is Rolled Back | Resolved | Transaction callback now returns `{ ok: false, error }` after `markFailed`, allowing commit before outer rethrow; rollback-aware regression test added |
| [BUG-182](../_archive/bugs/bug-182-history-questions-tag-array-query-crash.md) | History Questions Crashes on Repeated `tag` Query Param | Resolved | Added shared search-param normalization across all history parsers, including numeric `limit`/`offset` parsing for repeated params |
| [BUG-181](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md) | Session-Review Retry Allows Active Exam Answer Reveal | Resolved | Added active-session `session_review` guard before grading plus regression coverage |
| [BUG-180](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md) | Active Exam Answer Leak via Review Hydration | Resolved | Added active-exam attempt guard in answered-attempt branch and identifier-path regression tests |
| [BUG-151](../_archive/bugs/bug-151-card-row-affordance-inconsistency.md) | Card/Row Affordance Inconsistency — Misleading Hover, Missing Focus Rings, Pattern Asymmetry | Resolved | Removed misleading hover from non-interactive cards, added missing focus-visible rings to interactive inner links, converted history question cards to Pattern A (Link-as-Card), and updated regression/test coverage |
| [BUG-150](../_archive/bugs/bug-150-proxy-function-named-middleware.md) | Proxy Default Export Named `middleware` — Recurring False-Positive Audit Noise | Resolved | Renamed `proxy.ts` default export from `middleware` to `proxy`, renamed inner `clerkMiddleware` local to `clerkMw`, and added `proxy.test.ts` regression coverage to prevent naming drift |
| [BUG-149](../_archive/bugs/bug-149-idempotency-null-result-indistinguishable-from-pending.md) | Idempotency Null Result Is Indistinguishable from Pending State | Resolved | Added explicit `completed_at` completion marker to `idempotency_keys`, updated idempotency repository contracts/implementations, switched `withIdempotency` to completion-marker semantics with legacy non-null payload fallback, and added unit + integration regression coverage for null-result replay |
| [BUG-148](../_archive/bugs/bug-148-stripe-checkout-idempotency-key-fallback-random.md) | Stripe Checkout Idempotency Key Fallback Uses randomUUID() | Resolved | Replaced random fallback with deterministic `checkout_session:${userId}:${plan}` and added stale-session replay detection with a recovery key path (`checkout_session_recovery:${userId}:${plan}:${sessionId}`) |
| [BUG-147](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) | User Upsert Fails on Email Uniqueness Conflict When Clerk User ID Changes | Resolved | Added `users_email_uq` catch-and-update path in `DrizzleUserRepository`, added fake email-uniqueness parity, and added integration/unit regression tests |
| [BUG-146](../_archive/bugs/bug-146-marketing-footer-sign-in-up-casing-inconsistent.md) | Marketing Footer “Sign in/up” Casing Is Inconsistent with the Rest of the App | Resolved | Standardized footer auth labels to “Sign In” / “Sign Up” and added regression coverage |
| [BUG-145](../_archive/bugs/bug-145-frontend-ssot-docs-out-of-sync-with-question-view.md) | Frontend SSOT Docs Are Out of Sync with Current Question View Implementation | Resolved | Updated stale SSOT architecture docs to match current question page navigation and state restoration behavior |
| [BUG-144](../_archive/bugs/bug-144-marketing-layout-nests-main-landmarks.md) | MarketingLayout Nests `<main>` Landmarks (Regression of BUG-100) | Resolved | Centralized `#main-content` ownership in MarketingLayout and removed nested child `<main>` landmarks with regression tests |
| [BUG-137](../_archive/bugs/bug-137-entitlement-off-by-one-period-end-boundary.md) | Entitlement Check Off-by-One at Period End Boundary | Reclassified | SSOT and implementation both use an exclusive boundary (`currentPeriodEnd > now`); keep doc as policy record with a spec-change path for inclusive semantics |
| [BUG-139](../_archive/bugs/bug-139-get-previous-attempt-silent-null-on-data-mismatch.md) | GetPreviousAttemptUseCase Silently Returns Null on Data Integrity Mismatch | Resolved | Throw `NOT_FOUND` on attemptId/questionId mismatch (keeps UX fallback, but makes mismatch distinguishable); add regression coverage |
| [BUG-143](../_archive/bugs/bug-143-sentry-environment-tag-uses-inlined-node-env.md) | Sentry Environment Tag Uses Inlined NODE_ENV — Preview Errors Report as Production | Resolved | Use `VERCEL_ENV` (server) + `NEXT_PUBLIC_VERCEL_ENV` (client) for Sentry environment tags; inject client env via `next.config.ts`; add regression tests |
| [BUG-136](../_archive/bugs/bug-136-logger-uses-inlined-node-env-for-level.md) | Logger Uses Unreliable Inlined NODE_ENV for Log Level Selection | Resolved | Prefer `VERCEL_ENV` runtime lookup for default level selection; add regression tests |
| [BUG-134](../_archive/bugs/bug-134-mark-for-review-race-updates-wrong-question.md) | Mark-for-Review Race Can Update the Wrong Question UI State | Resolved | Guard mark-for-review sessionInfo updates by current questionId; add browser regression coverage |
| [BUG-133](../_archive/bugs/bug-133-stale-closure-practice-session-onsubmit.md) | Stale Closure in Practice Session onSubmit After Async Await | Resolved | Read post-await values from refs in submit handler; add browser regression coverage |
| [BUG-132](../_archive/bugs/bug-132-duplicate-nav-links-pricing-dashboard.md) | Duplicate Nav Links — "Pricing" and "Dashboard" Appear Twice in Header | Resolved | Removed duplicate links from AuthNav; layout owns left-nav links, AuthNav owns right-side auth controls |
| [BUG-131](../_archive/bugs/bug-131-e2e-bookmarks-empty-state-assertion-failure.md) | E2E Bookmarks Empty State Assertion Fails After Remove | Resolved | Stabilized the test by asserting either count decrement or empty-state with increased timeout |
| [BUG-130](../_archive/bugs/bug-130-e2e-session-start-selector-mismatch.md) | E2E Session Start Selectors Don't Match Current UI | Resolved | Updated `startSession()` to click SegmentedControl buttons and fill `Questions` input |
| [BUG-129](../_archive/bugs/bug-129-e2e-choice-radio-selector-mismatch.md) | E2E Choice Radio Selector Cannot Find Question Choices | Resolved | Updated `selectChoiceByLabel()` to match ChoiceButton DOM and assert radio checked |
| [BUG-128](../_archive/bugs/bug-128-sessioninfo-cleared-on-null-question.md) | sessionInfo Cleared on Null Question — Exam Defaults to Tutor, Navigator Drops | Resolved | Preserve sessionInfo when next question is null; added regression coverage |
| [BUG-127](../_archive/bugs/bug-127-double-click-submit-exam-race.md) | Double-Click "Submit Exam" Race in Review | Resolved | Ref-based guard + unanswered warning in confirm dialog; added browser regression coverage |
| [BUG-126](../_archive/bugs/bug-126-end-session-blocked-by-bookmark-pending.md) | End Session Blocked During Bookmark Operations | Reclassified | Not reproducible in current implementation; added regression guard |
| [BUG-125](../_archive/bugs/bug-125-no-more-questions-dead-end.md) | "No More Questions" Dead-End — No Action Buttons | Resolved | Add explicit session CTA in empty state; add regression coverage |
| [BUG-124](../_archive/bugs/bug-124-exam-review-stale-after-review-answer.md) | Exam Review Data Stale After Changing Answer from Review | Resolved | Verified reload path and added browser regression coverage |
| [BUG-123](../_archive/bugs/bug-123-exam-mode-correctchoiceid-leak.md) | Server Returns `correctChoiceId` to Client in Exam Mode | Resolved | Return `correctChoiceId: null` when explanations are hidden; update runtime schema + tests |
| [BUG-122](../_archive/bugs/bug-122-exam-choices-clickable-after-submit.md) | Choices Still Clickable After Exam Mode Submit | Resolved | Restore authoritative answered state and keep choices locked; add regression coverage |
| [BUG-121](../_archive/bugs/bug-121-session-start-button-missing-loading-state.md) | Session Start Button Never Shows Loading State | Resolved | Wire session start status to pending UI; add regression coverage |
| [BUG-120](../_archive/bugs/bug-120-reconciliation-missing-authoritative-conflict-strategy.md) | Reconciliation Job Missing Authoritative Conflict Strategy | Resolved | Reconciliation job now uses authoritative Stripe customer conflict strategy with regression coverage |
| [BUG-119](../_archive/bugs/bug-119-stripe-ended-status-missing-from-db-enum.md) | Stripe 'ended' Subscription Status Missing from DB Enum | Resolved | Removed invalid `'ended'` from Stripe subscription status union and added type-level regression coverage |
| [BUG-118](../_archive/bugs/bug-118-question-page-missing-shared-guards.md) | Question Page Missing Shared Practice-Page Guards | Resolved | Question page now uses shared guard helpers for choice selection, submit transitions, and canSubmit gating |
| [BUG-117](../_archive/bugs/bug-117-stripe-customer-create-missing-retry.md) | Stripe Customer Creation Non-Idempotent Path Missing Retry Wrapper | Resolved | Wrapped both idempotent and non-idempotent `customers.create` calls in `callStripeWithRetry()` and added regression coverage |
| [BUG-116](../_archive/bugs/bug-116-cron-route-blocked-by-clerk-middleware.md) | Cron Reconcile Route Blocked by Clerk Middleware | Resolved | Added cron route to public route matcher list so cron-secret auth executes at the route boundary |
| [BUG-115](../_archive/bugs/bug-115-cron-secret-validation-crashes-production-build.md) | DEBT-160 CRON_SECRET Startup Validation Crashes Production Build | Resolved | Removed import-time `CRON_SECRET` startup validation and scoped enforcement to request-time cron route checks to avoid build/runtime crashes |
| [BUG-114](../_archive/bugs/bug-114-subscribe-action-leaks-error-codes-to-url.md) | Subscribe Action Exposes Internal Error Codes in URL Params | Resolved | Removed internal `error_code/error_message` URL params from pricing redirects and kept diagnostics server-side only |
| [BUG-113](../_archive/bugs/bug-113-orphaned-attempt-on-ended-session.md) | Orphaned Attempt Persisted When Submitting to Ended Session | Resolved | `SubmitAnswerUseCase` now rejects ended-session submissions before insert, preventing orphan attempts and preserving session/attempt consistency |
| [BUG-112](../_archive/bugs/bug-112-navigator-fetch-silent-error-swallowing.md) | Navigator Fetch Silently Swallows Errors with No Error State | Resolved | Added explicit navigator load/error state with retry action so failures are visible, logged, and recoverable |
| [BUG-111](../_archive/bugs/bug-111-bookmark-toggle-silent-error-swallowing.md) | Bookmark Toggle Silently Swallows Errors | Resolved | Bookmark toggle now logs thrown failures before setting UI error state, preserving observability for production diagnostics |
| [BUG-110](../_archive/bugs/bug-110-choice-button-aria-label-overrides-answer-text.md) | ChoiceButton aria-label Overrides Full Answer Text | Resolved | Removed overriding `aria-label` so radios inherit full answer text from the wrapping label; added regression coverage |
| [BUG-105](../_archive/bugs/bug-105-concurrent-answer-submission-race-condition.md) | Concurrent Answer Submission Can Create Duplicate Attempts | Resolved | Migration now deduplicates historical `(practice_session_id, question_id)` collisions before creating partial unique index; repository/fake both map duplicate submissions to `CONFLICT` |
| [BUG-109](../_archive/bugs/bug-109-cron-route-limit-mismatch.md) | Cron Route MAX_LIMIT (1000) Exceeds Reconciliation MAX_LIMIT (500) | Resolved | Route and job now share `RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT` with route-level regression coverage |
| [BUG-108](../_archive/bugs/bug-108-submit-answer-unbounded-time-spent-seconds.md) | submitAnswer Allows Unbounded timeSpentSeconds at Use-Case Layer | Resolved | Use case now enforces 24-hour max cap and controller/shared limit references remain aligned |
| [BUG-107](../_archive/bugs/bug-107-hardcoded-route-incomplete-session-card.md) | Hardcoded Route Path in Incomplete Session Card | Resolved | Replaced hardcoded path with `toPracticeSessionRoute(sessionId)` |
| [BUG-106](../_archive/bugs/bug-106-stripe-customer-search-query-interpolation.md) | Stripe Customer Search Query Uses String Interpolation | Resolved | Added defensive metadata-value validation before Stripe search query construction |
| [BUG-104](../_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md) | Double Pruning — Webhook Controller and Hot Paths Both Prune | Resolved | Removed redundant idempotency-key and rate-limit pruning from webhook controller; hot paths are the sole owners |
| [BUG-103](../_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md) | Idempotency Key Pruning Never Wired to Production | Resolved | Added hot-path pruning in `withIdempotency`; webhook-side duplicate pruning was later removed in BUG-104 |
| [BUG-102](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) | Rate Limits Table Unbounded Growth | Resolved | Added `RateLimiter.pruneExpiredWindows` + Drizzle/Fake implementations and opportunistic pruning from `DrizzleRateLimiter.limit()` |
| [BUG-101](../_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md) | Stripe Checkout Can Create Duplicate Subscriptions if DB State Drifts | Resolved | Added Stripe-side active-subscription guard (`subscriptions.list`) before checkout session creation so stale local state cannot create duplicate paid subscriptions |
| [BUG-100](../_archive/bugs/bug-100-nested-main-landmarks-in-layouts.md) | Nested `<main>` Landmarks Across Root and Segment Layouts | Resolved | Root layout no longer wraps route trees in a global `<main>` and route-level shells now own `#main-content` landmarks |
| [BUG-099](../_archive/bugs/bug-099-checkout-success-race-concurrent-webhook-conflict.md) | Checkout Success Race with Concurrent Webhook CONFLICT | Resolved | Checkout success now uses authoritative customer conflict strategy so webhook-first races remain idempotent and redirect users to dashboard |
| [BUG-098](../_archive/bugs/bug-098-submit-answer-accepts-questions-not-in-session.md) | submitAnswer Accepts Questions Not in Session | Resolved | Added pre-insert session-question membership guard in `SubmitAnswerUseCase` to reject mismatches before persistence |
| [BUG-097](../_archive/bugs/bug-097-widespread-hard-coded-route-strings.md) | Widespread Hard-Coded Route Strings Across Codebase | Resolved | Completed route-constant sweep and added missing `ROUTES.SIGN_IN`/`ROUTES.SIGN_UP` constants |
| [BUG-096](../_archive/bugs/bug-096-toggle-bookmark-missing-idempotency-key.md) | `toggleBookmark` Missing Idempotency Key | Resolved | Wrapped bookmark toggle with `withIdempotency` and propagated client-generated keys |
| [BUG-095](../_archive/bugs/bug-095-set-question-mark-missing-idempotency-key.md) | `setPracticeSessionQuestionMark` Missing Idempotency Key | Resolved | Added schema support + `withIdempotency` and hook-level key propagation |
| [BUG-094](../_archive/bugs/bug-094-exam-review-error-misleading-try-again.md) | Exam Review Error State — Misleading "Try Again" Ends Session | Resolved | Split review-error actions into true retry path and explicit end-session path |
| [BUG-093](../_archive/bugs/bug-093-hard-coded-route-practice-view-navigation.md) | Hard-Coded Route in Practice View Navigation | Reclassified | Closed as duplicate of BUG-097 (single-instance subset) |
| [BUG-092](../_archive/bugs/bug-092-circular-module-dependency-practice-page-decomposition.md) | Circular Module Dependency in Practice Page Decomposition | Resolved | Stale report; cycle already removed via shared `practice-page-types.ts` extraction |
| [BUG-091](../_archive/bugs/bug-091-end-practice-session-missing-idempotency-key.md) | `endPracticeSession` Missing Idempotency Key | Resolved | Added idempotency key schema + `withIdempotency` replay support |
| [BUG-090](../_archive/bugs/bug-090-practice-error-state-missing-escape-hatch.md) | Practice Error State Has No Escape Hatch | Resolved | Added `Return to dashboard` escape hatch to practice error card |
| [BUG-089](../_archive/bugs/bug-089-bookmark-loading-effect-missing-loading-state.md) | Bookmark Loading Effect Missing Loading State | Resolved | Stale report; loading transition already existed in production code |
| [BUG-088](../_archive/bugs/bug-088-clerk-webhook-invalid-payload-message-leak.md) | Clerk Webhook Invalid-Payload Response Leaks Internal Error Message | Resolved | Clerk webhook now returns a generic validation failure message while logging internal context server-side |
| [BUG-087](../_archive/bugs/bug-087-practice-tag-load-throw-stalls-page.md) | Practice Tag Load Throw Leaves Page Stuck in Loading | Resolved | Added try/catch around tag loading and transitioned thrown failures to `tagLoadStatus: 'error'` with regression coverage |
| [BUG-086](../_archive/bugs/bug-086-session-history-drilldown-race-overwrites-selected-session.md) | Session History Drill-Down Race Can Show Wrong Session Details | Resolved | Added latest-request session guard in session-history drill-down so stale responses cannot overwrite selected session review |
| [BUG-085](../_archive/bugs/bug-085-out-of-order-question-load-overwrites-current-state.md) | Out-of-Order Question Loads Can Overwrite Current State | Resolved | Added request-sequencing guards to both question loaders and hooked request IDs in both practice flows so stale responses are discarded |
| [BUG-077](../_archive/bugs/bug-077-payment-processing-confusing-redirect.md) | Payment Processing Users See Wrong Error Message | Resolved | `CheckEntitlementUseCase` now returns redirect context; app layout redirects payment-processing and billing-recovery states with reason-specific messaging |
| [BUG-075](../_archive/bugs/bug-075-checkout-guard-entitlement-mismatch.md) | Pricing CTA Mismatch for Recoverable Subscription States | Resolved | Pricing now consumes entitlement context and shows manage-billing guidance for recoverable non-entitled states while preserving strict checkout guard |
| BUG-076 | Past-Due Immediate Lockout | Reclassified | Reclassified to [DEBT-136](../_archive/debt/debt-136-dunning-grace-period-for-past-due-subscribers.md) — feature request (dunning grace period), not a bug |
| [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md) | Missed Questions Can Be Misclassified on `answered_at` Timestamp Ties | Resolved | Use deterministic latest-attempt ranking (`answered_at DESC, id DESC`) for missed-question list/count |
| [BUG-073](../_archive/bugs/bug-073-tutor-mode-missing-session-summary-detail.md) | Tutor Mode Missing Per-Question Session Summary at End | Resolved | Implemented in SPEC-020 Phase 2 / DEBT-123 (PR #63) |
| [BUG-072](../_archive/bugs/bug-072-no-question-navigation-in-practice-sessions.md) | No Question Navigation in Practice Sessions (Both Modes) | Resolved | Implemented in SPEC-020 Phase 2 / DEBT-122 (PR #63) |
| [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) | Preview Deployment Rendered Blank Page After CSP Tightening | Resolved | Delegate CSP to Clerk middleware |
| [BUG-070](../_archive/bugs/bug-070-e2e-test-user-checkout-fails.md) | E2E Test User Checkout Failed (Stripe `this` Binding Bug) | Resolved | Bind `stripe.customers.search` to preserve `this` |
| [BUG-069](../_archive/bugs/bug-069-stripe-checkout-fails-localhost.md) | Stripe Checkout Fails for New Users (Lost `this` Binding) | Resolved | Bind `stripe.customers.search` to preserve `this` |

## Foundation Audits

- **2026-02-02:** [Foundation Audit Report #1](../_archive/audits/audit-001-foundation-report.md) — Vertical/horizontal trace of all critical paths
- **2026-02-07:** [Foundation Audit Report #2](../_archive/audits/audit-002-foundation-report-2.md) — Six-axis deep audit (billing, practice, auth, UI, DB, code quality)
- **2026-02-16:** Audit #3 — Five-axis codebase sweep (domain, application, adapters, frontend, config). 3 confirmed bugs (BUG-136, BUG-137, BUG-139) out of 17 initial findings after triple-check verification.

## Archived Bugs

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [BUG-159](../_archive/bugs/bug-159-review-mode-hydration-flicker.md) | Review-Mode Hydration Flicker — Transient Submit UI Shown in Review Route | P3 | 2026-02-26 |
| [BUG-158](../_archive/bugs/bug-158-quick-practice-page-ux-polish.md) | Quick Practice Page UX Polish — Back Link Arrow and Filter Tab Affordance | P3 | 2026-02-26 |
| [BUG-153](../_archive/bugs/bug-153-reattempt-label-incorrect-dashboard-bookmarks.md) | "Try Again" Label Shown for Correct Answers on Dashboard and Bookmarks Review | P3 | 2026-02-26 |
| [BUG-156](../_archive/bugs/bug-156-practice-view-post-submit-ux.md) | Practice View Post-Submit UX — Button Promotion and Auto-Scroll to Feedback | P1 | 2026-02-26 |
| [BUG-154](../_archive/bugs/bug-154-markdown-prose-spacing.md) | Markdown Prose Spacing — Question Stem and Explanation Paragraphs Run Together | P1 | 2026-02-26 |
| [BUG-152](../_archive/bugs/bug-152-history-questions-tab-navigator-mismatch.md) | History Questions Tab Navigator Mismatch — Ad-Hoc Questions Grouped Into Fake Session | P1 | 2026-02-26 |
| [BUG-147](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) | User Upsert Fails on Email Uniqueness Conflict When Clerk User ID Changes | P1 | 2026-02-21 |
| [BUG-146](../_archive/bugs/bug-146-marketing-footer-sign-in-up-casing-inconsistent.md) | Marketing Footer “Sign in/up” Casing Is Inconsistent with the Rest of the App | P4 | 2026-02-17 |
| [BUG-145](../_archive/bugs/bug-145-frontend-ssot-docs-out-of-sync-with-question-view.md) | Frontend SSOT Docs Are Out of Sync with Current Question View Implementation | P3 | 2026-02-17 |
| [BUG-144](../_archive/bugs/bug-144-marketing-layout-nests-main-landmarks.md) | MarketingLayout Nests `<main>` Landmarks (Regression of BUG-100) | P2 | 2026-02-17 |
| [BUG-132](../_archive/bugs/bug-132-duplicate-nav-links-pricing-dashboard.md) | Duplicate Nav Links — "Pricing" and "Dashboard" Appear Twice in Header | P3 | 2026-02-13 |
| [BUG-116](../_archive/bugs/bug-116-cron-route-blocked-by-clerk-middleware.md) | Cron Reconcile Route Blocked by Clerk Middleware | P2 | 2026-02-08 |
| [BUG-115](../_archive/bugs/bug-115-cron-secret-validation-crashes-production-build.md) | DEBT-160 CRON_SECRET Startup Validation Crashes Production Build | P0 | 2026-02-08 |
| [BUG-114](../_archive/bugs/bug-114-subscribe-action-leaks-error-codes-to-url.md) | Subscribe Action Exposes Internal Error Codes in URL Params | P3 | 2026-02-08 |
| [BUG-113](../_archive/bugs/bug-113-orphaned-attempt-on-ended-session.md) | Orphaned Attempt Persisted When Submitting to Ended Session | P3 | 2026-02-08 |
| [BUG-112](../_archive/bugs/bug-112-navigator-fetch-silent-error-swallowing.md) | Navigator Fetch Silently Swallows Errors with No Error State | P2 | 2026-02-08 |
| [BUG-111](../_archive/bugs/bug-111-bookmark-toggle-silent-error-swallowing.md) | Bookmark Toggle Silently Swallows Errors | P2 | 2026-02-08 |
| [BUG-110](../_archive/bugs/bug-110-choice-button-aria-label-overrides-answer-text.md) | ChoiceButton aria-label Overrides Full Answer Text | P1 | 2026-02-08 |
| [BUG-105](../_archive/bugs/bug-105-concurrent-answer-submission-race-condition.md) | Concurrent Answer Submission Can Create Duplicate Attempts | P1 | 2026-02-08 |
| [BUG-109](../_archive/bugs/bug-109-cron-route-limit-mismatch.md) | Cron Route MAX_LIMIT (1000) Exceeds Reconciliation MAX_LIMIT (500) | P2 | 2026-02-08 |
| [BUG-108](../_archive/bugs/bug-108-submit-answer-unbounded-time-spent-seconds.md) | submitAnswer Allows Unbounded timeSpentSeconds at Use-Case Layer | P2 | 2026-02-08 |
| [BUG-107](../_archive/bugs/bug-107-hardcoded-route-incomplete-session-card.md) | Hardcoded Route Path in Incomplete Session Card | P2 | 2026-02-08 |
| [BUG-106](../_archive/bugs/bug-106-stripe-customer-search-query-interpolation.md) | Stripe Customer Search Query Uses String Interpolation | P1 | 2026-02-08 |
| [BUG-104](../_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md) | Double Pruning — Webhook Controller and Hot Paths Both Prune | P2 | 2026-02-07 |
| [BUG-103](../_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md) | Idempotency Key Pruning Never Wired to Production | P2 | 2026-02-07 |
| [BUG-102](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) | Rate Limits Table Unbounded Growth | P2 | 2026-02-07 |
| [BUG-101](../_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md) | Stripe Checkout Can Create Duplicate Subscriptions if DB State Drifts | P1 | 2026-02-07 |
| [BUG-100](../_archive/bugs/bug-100-nested-main-landmarks-in-layouts.md) | Nested `<main>` Landmarks Across Root and Segment Layouts | P2 | 2026-02-07 |
| [BUG-099](../_archive/bugs/bug-099-checkout-success-race-concurrent-webhook-conflict.md) | Checkout Success Race with Concurrent Webhook CONFLICT | P2 | 2026-02-07 |
| [BUG-098](../_archive/bugs/bug-098-submit-answer-accepts-questions-not-in-session.md) | submitAnswer Accepts Questions Not in Session | P2 | 2026-02-07 |
| [BUG-097](../_archive/bugs/bug-097-widespread-hard-coded-route-strings.md) | Widespread Hard-Coded Route Strings Across Codebase | P4 | 2026-02-07 |
| [BUG-096](../_archive/bugs/bug-096-toggle-bookmark-missing-idempotency-key.md) | `toggleBookmark` Missing Idempotency Key | P4 | 2026-02-07 |
| [BUG-095](../_archive/bugs/bug-095-set-question-mark-missing-idempotency-key.md) | `setPracticeSessionQuestionMark` Missing Idempotency Key | P4 | 2026-02-07 |
| [BUG-094](../_archive/bugs/bug-094-exam-review-error-misleading-try-again.md) | Exam Review Error State — Misleading "Try Again" Ends Session | P3 | 2026-02-07 |
| [BUG-093](../_archive/bugs/bug-093-hard-coded-route-practice-view-navigation.md) | Hard-Coded Route in Practice View Navigation | P4 | 2026-02-07 (Reclassified) |
| [BUG-092](../_archive/bugs/bug-092-circular-module-dependency-practice-page-decomposition.md) | Circular Module Dependency in Practice Page Decomposition | P4 | 2026-02-07 |
| [BUG-091](../_archive/bugs/bug-091-end-practice-session-missing-idempotency-key.md) | `endPracticeSession` Missing Idempotency Key | P3 | 2026-02-07 |
| [BUG-090](../_archive/bugs/bug-090-practice-error-state-missing-escape-hatch.md) | Practice Error State Has No Escape Hatch | P3 | 2026-02-07 |
| [BUG-084](../_archive/bugs/bug-084-webhook-error-message-leaks-context.md) | Webhook Error Response Leaks Implementation Details | P2 | 2026-02-07 |
| [BUG-083](../_archive/bugs/bug-083-stale-closure-mark-for-review.md) | Stale Closure Risk in usePracticeSessionMarkForReview | P3 | 2026-02-07 |
| [BUG-082](../_archive/bugs/bug-082-void-promises-swallow-errors.md) | Void Promises Silently Swallow Errors in Practice Page | P2 | 2026-02-07 |
| [BUG-081](../_archive/bugs/bug-081-bookmark-timeout-race-condition.md) | Bookmark Message Timeout Fires After Component Unmount | P2 | 2026-02-07 |
| [BUG-080](../_archive/bugs/bug-080-vercel-env-var-deployment-issues.md) | Vercel Env Var Trailing Newlines + Deployment Protection | P1 | 2026-02-06 |
| [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md) | Preview/Dev Environment Verification Failures | P1 | 2026-02-06 |
| [BUG-078](../_archive/bugs/bug-078-clerk-production-google-oauth-not-configured.md) | Clerk Production Sign-In Broken | P0 | 2026-02-06 |
| [BUG-077](../_archive/bugs/bug-077-payment-processing-confusing-redirect.md) | Payment Processing Users See Wrong Error Message | P2 | 2026-02-06 |
| [BUG-075](../_archive/bugs/bug-075-checkout-guard-entitlement-mismatch.md) | Pricing CTA Mismatch for Recoverable Subscription States | P2 | 2026-02-06 |
| [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md) | Missed Questions Can Be Misclassified on `answered_at` Timestamp Ties | P2 | 2026-02-06 |
| [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) | Preview Deployment Rendered Blank Page After CSP Tightening | P0 | 2026-02-05 |
| [BUG-070](../_archive/bugs/bug-070-e2e-test-user-checkout-fails.md) | E2E Test User Checkout Failed (Stripe `this` Binding Bug) | P1 | 2026-02-05 |
| [BUG-069](../_archive/bugs/bug-069-stripe-checkout-fails-localhost.md) | Stripe Checkout Fails for New Users (Lost `this` Binding) | P1 | 2026-02-05 |
| [BUG-067](../_archive/bugs/bug-067-clerk-shows-ntx-university-name.md) | Clerk Shows Wrong App Name | P3 | 2026-02-05 |
| [BUG-066](../_archive/bugs/bug-066-clerk-development-keys-in-production.md) | Clerk Development Keys in Production | P1 | 2026-02-05 |
| [BUG-064](../_archive/bugs/bug-064-clerk-key-mismatch-warning.md) | Clerk Key Mismatch Warning (False Alarm) | P4 | 2026-02-05 |
| [BUG-062](../_archive/bugs/bug-062-practice-session-modes-not-working.md) | Practice Session Modes Not Working (False Alarm) | P1 | 2026-02-05 |
| [BUG-063](../_archive/bugs/bug-063-csp-blocks-clerk-blob-workers.md) | CSP Blocks Clerk Blob Workers | P3 | 2026-02-05 |
| [BUG-068](../_archive/bugs/bug-068-reattempt-page-ux-confusion.md) | Reattempt Page UX Confusion - Buttons After Submit | P3 | 2026-02-05 |
| [BUG-065](../_archive/bugs/bug-065-explanation-not-available-some-questions.md) | Exam Mode Shows Feedback When It Shouldn't | P2 | 2026-02-05 |
| [BUG-061](../_archive/bugs/bug-061-debt-index-claims-no-active-items-while-listing-debt-102.md) | Debt Index Claims No Active Items While Listing DEBT-102 | P4 | 2026-02-05 |
| [BUG-060](../_archive/bugs/bug-060-question-reattempt-submit-not-disabled-while-loading.md) | Question Reattempt Submit Not Disabled While Loading | P3 | 2026-02-05 |
| [BUG-059](../_archive/bugs/bug-059-marketing-homepage-low-contrast-in-light-mode.md) | Marketing Homepage Low Contrast in Light Mode | P1 | 2026-02-05 |
| [BUG-058](../_archive/bugs/bug-058-theme-toggle-does-not-work-without-themeprovider.md) | Theme Toggle Does Not Work Without ThemeProvider | P3 | 2026-02-05 |
| [BUG-057](../_archive/bugs/bug-057-choice-label-badges-render-clipped.md) | Choice Label Badges Render Clipped | P3 | 2026-02-05 |
| [BUG-056](../_archive/bugs/bug-056-shuffled-choice-labels-out-of-order.md) | Shuffled Choice Labels Display Out of Order | P3 | 2026-02-05 |
| [BUG-055](../_archive/bugs/bug-055-post-login-redirects-to-landing-page.md) | Authenticated Subscribers Redirected to Landing Page After Sign-In | P2 | 2026-02-04 |
| [BUG-054](../_archive/bugs/bug-054-async-state-updates-after-unmount-in-page-logic.md) | Async State Updates After Component Unmount in Page Logic | P2 | 2026-02-03 |
| [BUG-053](../_archive/bugs/bug-053-checkout-success-missing-user-id-metadata.md) | Checkout Success Accepts Missing `metadata.user_id` | P1 | 2026-02-03 |
| [BUG-052](../_archive/bugs/bug-052-non-entitled-subscriptions-could-start-new-checkout.md) | Non-Entitled Subscriptions Could Start New Checkout Sessions | P1 | 2026-02-03 |
| [BUG-051](../_archive/bugs/bug-051-checkout-success-redirects-with-non-entitled-status.md) | Checkout Success Redirects with Non-Entitled Status | P1 | 2026-02-03 |
| [BUG-050](../_archive/bugs/bug-050-stripe-webhook-missing-user-id-metadata.md) | Stripe Webhook Skips Events Missing `metadata.user_id` | P1 | 2026-02-03 |
| [BUG-049](../_archive/bugs/bug-049-silent-pruning-failures-stripe-webhook.md) | Silent Pruning Failures in Stripe Webhook Controller | P3 | 2026-02-03 |
| [BUG-048](../_archive/bugs/bug-048-webhook-rate-limiter-fails-open.md) | Webhook Rate Limiter Failures Fail Open | P2 | 2026-02-03 |
| [BUG-047](../_archive/bugs/bug-047-multiple-subscriptions-per-user.md) | Multiple Subscriptions Created Per User | P1 | 2026-02-02 |
| [BUG-046](../_archive/bugs/bug-046-review-page-ambiguous-column.md) | Review Page SQL Error — Ambiguous Column Reference | P1 | 2026-02-02 |
| [BUG-045](../_archive/bugs/bug-045-checkout-missing-current-period-end.md) | Checkout Success Validation Fails — missing_current_period_end | P1 | 2026-02-02 |
| [BUG-044](../_archive/bugs/bug-044-checkout-success-stale-cache.md) | Checkout Success Page Serving Stale Code | P2 | 2026-02-02 |
| [BUG-043](../_archive/bugs/bug-043-checkout-success-not-public-route.md) | Checkout Success Route Not Public (Stripe Return) | P2 | 2026-02-02 |
| [BUG-041](../_archive/bugs/bug-041-webhook-subscription-created-missing-metadata.md) | Webhook 500 on customer.subscription.created (Missing metadata.user_id) | P2 | 2026-02-02 |
| [BUG-042](../_archive/bugs/bug-042-checkout-success-silent-validation-failure.md) | Checkout Success Redirects Without Diagnostics | P1 | 2026-02-02 |
| [BUG-040](../_archive/bugs/bug-040-clerk-key-mismatch-infinite-redirect.md) | Clerk Infinite Redirect Loop Warning (Key Mismatch) | P2 | 2026-02-02 |
| [BUG-039](../_archive/bugs/bug-039-checkout-success-searchparams-not-awaited.md) | Checkout Success Page Crashes — searchParams Not Awaited | P1 | 2026-02-02 |
| [BUG-028](../_archive/bugs/bug-028-inconsistent-cascade-delete-attempts.md) | Inconsistent Cascade Delete for Attempts | P2 | 2026-02-02 |
| [BUG-024](../_archive/bugs/bug-024-entitlement-race-condition-past-due.md) | Entitlement Race Condition During Payment Failure | P2 | 2026-02-02 |
| [BUG-016](../_archive/bugs/bug-016-memory-exhaustion-power-users.md) | Memory Exhaustion for Power Users — All Attempts Loaded Into Memory | P1 | 2026-02-02 |
| [BUG-023](../_archive/bugs/bug-023-missing-clerk-user-deletion-webhook.md) | Missing Clerk Webhook for User Deletion — Orphaned Data | P2 | 2026-02-02 |
| [BUG-019](../_archive/bugs/bug-019-missing-bookmarks-view-page.md) | Missing Bookmarks View Page — Users Can Bookmark But Can't View | P2 | 2026-02-02 |
| [BUG-020](../_archive/bugs/bug-020-missing-review-missed-questions-page.md) | Missing Review/Missed Questions Page — Dead Controller Code | P2 | 2026-02-02 |
| [BUG-021](../_archive/bugs/bug-021-practice-sessions-never-started.md) | Practice Sessions Never Started/Ended — Dead Session Controller Code | P2 | 2026-02-02 |
| [BUG-025](../_archive/bugs/bug-025-missing-subscription-event-handlers.md) | Missing Subscription Event Handlers (paused/resumed) | P2 | 2026-02-02 |
| [BUG-026](../_archive/bugs/bug-026-concurrent-checkout-sessions.md) | No Protection Against Concurrent Checkout Sessions | P2 | 2026-02-02 |
| [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) | Stripe Events Table Unbounded Growth | P2 | 2026-02-02 |
| [BUG-038](../_archive/bugs/bug-038-missing-clerk-user-updated-webhook.md) | Missing Clerk user.updated Webhook — Email Sync Gap | P3 | 2026-02-02 |
| [BUG-037](../_archive/bugs/bug-037-no-mobile-navigation-menu.md) | No Mobile Navigation Menu | P2 | 2026-02-02 |
| [BUG-036](../_archive/bugs/bug-036-no-loading-state-subscribe-buttons.md) | No Loading State on Subscribe Buttons | P2 | 2026-02-02 |
| [BUG-022](../_archive/bugs/bug-022-missing-loading-states-on-forms.md) | Missing Loading States on Form Buttons | P3 | 2026-02-02 |
| [BUG-018](../_archive/bugs/bug-018-silent-fallbacks-in-controllers.md) | Silent Fallbacks in Controllers — Data Inconsistency | P2 | 2026-02-02 |
| [BUG-017](../_archive/bugs/bug-017-billing-button-without-subscription.md) | Billing Page Shows "Manage in Stripe" When No Subscription | P2 | 2026-02-02 |
| [BUG-035](../_archive/bugs/bug-035-error-banner-not-clearable.md) | Error Banner Not Clearable on Pricing Page | P3 | 2026-02-02 |
| [BUG-034](../_archive/bugs/bug-034-webhook-error-context-lost.md) | Webhook Catch Block Loses Error Context | P2 | 2026-02-02 |
| [BUG-033](../_archive/bugs/bug-033-stale-closure-toggle-bookmark.md) | Stale Closure in onToggleBookmark — Wrong Question Bookmarked | P2 | 2026-02-02 |
| [BUG-032](../_archive/bugs/bug-032-state-update-after-unmount.md) | State Update After Component Unmount in Practice Page | P2 | 2026-02-02 |
| [BUG-031](../_archive/bugs/bug-031-non-unique-react-key-dashboard.md) | Non-Unique React Key in Dashboard Recent Activity | P3 | 2026-02-02 |
| [BUG-015](../_archive/bugs/bug-015-fragile-webhook-error-matching.md) | Fragile Webhook Error Matching Uses String Instead of Error Code | P1 | 2026-02-02 |
| [BUG-029](../_archive/bugs/bug-029-answer-choices-not-randomized.md) | Answer Choices Not Randomized — Test Validity Issue | P1 | 2026-02-02 |
| [BUG-030](../_archive/bugs/bug-030-time-spent-always-zero.md) | Time Spent Always Zero — No Timer Implementation | P1 | 2026-02-02 |
| [BUG-014](../_archive/bugs/bug-014-pricing-subscribe-action-not-working.md) | Pricing Subscribe Action Not Working (Server Action Serialization) | P1 | 2026-02-02 |
| [BUG-013](../_archive/bugs/bug-013-silent-error-handling.md) | Silent Error Handling — Errors Swallowed Without Logging or User Feedback | P1 | 2026-02-02 |
| [BUG-012](../_archive/bugs/bug-012-incomplete-feature-wiring.md) | Incomplete Feature Wiring — Missing Controllers and E2E Coverage | P2 | 2026-02-02 |
| [BUG-011](../_archive/bugs/bug-011-ux-flow-gaps-multiple-issues.md) | UX Flow Gaps — Multiple Navigation and Wiring Issues | P1 | 2026-02-02 |
| [BUG-010](../_archive/bugs/bug-010-database-not-seeded.md) | Database Not Seeded — No Questions Available | P1 | 2026-02-02 |
| [BUG-001](../_archive/bugs/bug-001-pnpm-s-vim-hang.md) | `pnpm -s …` Can Launch Vim and Hang | P2 | 2026-02-01 |
| [BUG-002](../_archive/bugs/bug-002-next-build-node-env-skip-clerk.md) | `NEXT_PUBLIC_SKIP_CLERK` blocked `next build` | P1 | 2026-02-01 |
| [BUG-003](../_archive/bugs/bug-003-fake-repo-throws-error-not-application-error.md) | FakePracticeSessionRepository throws Error | P0 | 2026-01-31 |
| [BUG-004](../_archive/bugs/bug-004-submit-answer-hardcoded-time-spent.md) | SubmitAnswer hardcodes timeSpentSeconds | P2 | 2026-01-31 |
| [BUG-005](../_archive/bugs/bug-005-auth-nav-dashboard-link-404.md) | Nav Links to Missing `/app/dashboard` | P2 | 2026-02-01 |
| [BUG-006](../_archive/bugs/bug-006-dark-mode-not-applied.md) | Dark Theme Not Applied | P4 | 2026-02-01 |
| [BUG-007](../_archive/bugs/bug-007-question-frontmatter-duplicate-tag-slugs.md) | Duplicate Tag Slugs in Frontmatter | P3 | 2026-02-01 |
| [BUG-008](../_archive/bugs/bug-008-stripe-webhook-endpoint-missing.md) | Stripe Webhook Endpoint Missing (`/api/stripe/webhook`) | P0 | 2026-02-01 |
| [BUG-009](../_archive/bugs/bug-009-vercel-preview-deployment-rate-limit.md) | Vercel Preview Deployment Status Fails Due to Rate Limit | P3 | 2026-02-01 |

## Bug Statuses

- **Open** — Bug confirmed, not yet fixed
- **In Progress** — Fix being developed
- **Blocked - Manual Action Required** — Requires external configuration (Clerk/Vercel/etc) not fixable in-repo
- **Resolved** — Fix merged and verified
- **Won't Fix** — Decided not to fix (with justification)
- **Reclassified** — Root cause accepted, ownership moved to another tracked item (for example technical debt or a feature spec)

## Priority Levels

- **P0** — Critical: System broken, data loss, security issue
- **P1** — High: Major functionality broken
- **P2** — Medium: Feature degraded but workaround exists
- **P3** — Low: Minor issue, cosmetic
- **P4** — Trivial: Nice to have

---

## How to Report a New Bug

1. Create `bug-NNN-short-description.md` using the template below
2. Set status to "Open"
3. Assign priority based on impact
4. Submit PR for triage

## Bug Template

```markdown
# BUG-NNN: Short Title

**Status:** Open | In Progress | Blocked - Manual Action Required | Resolved | Won't Fix | Reclassified
**Priority:** P0 | P1 | P2 | P3 | P4
**Date:** YYYY-MM-DD

---

## Description

What is the bug? What behavior is observed vs expected?

## Steps to Reproduce

1. ...
2. ...
3. ...

## Root Cause

Why did this happen? (Fill in after investigation)

## Fix

What was done to fix it? (Fill in after resolution)

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- Links to PRs, commits, related bugs/debt
```

---

## Archive

Resolved bugs are archived to `docs/_archive/bugs/` after verification.
