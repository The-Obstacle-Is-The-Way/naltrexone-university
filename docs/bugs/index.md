# Bug Reports

**Project:** Naltrexone University
**Last Updated:** 2026-02-26

---

## What are Bug Reports?

Bug reports document issues discovered in the codebase along with their root cause, fix, and verification. They serve as:

1. **Issue Tracking** — Formal record of what went wrong and how it was fixed
2. **Regression Prevention** — Ensure we don't reintroduce the same bugs
3. **Knowledge Base** — Help future developers understand past issues

## Bug Index (Active)

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [BUG-152](bug-152-history-questions-tab-navigator-mismatch.md) | History Questions Tab Navigator Mismatch — Ad-Hoc Questions Grouped Into Fake Session | P1 | Fixed (2026-02-26) |
| [BUG-153](bug-153-reattempt-label-incorrect-dashboard-bookmarks.md) | "Try Again" Label Shown for Correct Answers on Dashboard and Bookmarks Review | P3 | Open |
| [BUG-154](bug-154-markdown-prose-spacing.md) | Markdown Prose Spacing — Question Stem and Explanation Paragraphs Run Together | P1 | Fixed (2026-02-26) |
| [BUG-155](bug-155-feedback-card-visual-overhaul.md) | Feedback Card Visual Overhaul — Verdict Badge, Correct Answer Display, Wrong-Answer Cards, Accessibility | P2 | Open |
| [BUG-156](bug-156-practice-view-post-submit-ux.md) | Practice View Post-Submit UX — Button Promotion and Auto-Scroll to Feedback | P1 | Fixed (2026-02-26) |
| [BUG-157](bug-157-question-card-choice-button-visual-polish.md) | Question Card and Choice Button Visual Polish — Text Size, Spacing, Contrast, Post-Submit Indicators | P2 | Open |
| [BUG-158](bug-158-quick-practice-page-ux-polish.md) | Quick Practice Page UX Polish — Back Link Arrow and Filter Tab Affordance | P3 | Open |
| [BUG-159](bug-159-review-mode-hydration-flicker.md) | Review-Mode Hydration Flicker — Transient Submit UI Shown in Review Route | P3 | Open |

**Next Bug ID:** BUG-160

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
