# DEBT-100: Adversarial Codebase Audit Backlog (2026-02-04)

**Status:** Open
**Priority:** P0
**Date:** 2026-02-04

---

## Description

A multi-agent adversarial audit (auth, UI/UX, architecture, data integrity, feature completeness) identified the following backlog items. This document records **verified** findings, corrects any inaccurate claims, and defines concrete next steps.

**Scope note:** This is an evolving backlog document. Fixes land in follow-up PRs; this doc should be updated as items are resolved.

---

## Verified Findings (by priority)

### P0 — Ship blockers

#### 1) Checkout customer creation is not atomic

**Evidence:** `src/application/use-cases/create-checkout-session.ts` creates a Stripe customer and then inserts the mapping in a second step (`getOrCreateStripeCustomerId()`).

**Why this matters:** If the DB insert fails after Stripe customer creation succeeds, we can temporarily (or permanently) end up with:
- an orphan Stripe customer (no local mapping), and
- potential duplicate customers if retries happen outside Stripe’s idempotency retention window.

**Current mitigations (good but not perfect):**
- Stripe idempotency key is used (`stripe_customer:${userId}`)
- DB insert is conflict-safe in the repository layer

**Resolution (proposed):**
- Implement a saga / retry-aware “ensure external customer mapping” strategy:
  - Persist a local idempotency claim before external call, or
  - Store a “pending mapping” record first, then finalize, or
  - Add a deterministic lookup fallback (retrieve customer by metadata/clerk id) before creating a new customer.

**Verification:**
- Add a unit test simulating DB failure after Stripe customer creation and ensure subsequent retries converge to a single mapping.

#### 2) ✅ Route segment `loading.tsx` added

**Previous evidence (resolved):** No `app/**/loading.tsx` files existed, so route segment loading states fell back to a blank UI during suspense/data fetch.

**Resolution (implemented, 2026-02-05):**
- Added skeleton loading UIs:
  - `app/(app)/app/dashboard/loading.tsx`
  - `app/(app)/app/practice/loading.tsx`
  - `app/(app)/app/practice/[sessionId]/loading.tsx`
  - `app/(app)/app/review/loading.tsx`
  - `app/(app)/app/bookmarks/loading.tsx`
  - `app/(app)/app/billing/loading.tsx`
  - `app/(app)/app/questions/[slug]/loading.tsx`
- Shared skeleton component: `components/loading/page-loading.tsx`

**Verification:**
- Manual: throttle network (e.g., Chrome “Fast 3G”) and confirm skeleton/spinner renders.

---

### P1 — Must fix before launch

#### 3) ✅ Error tracking configured (Sentry)

**Previous evidence (resolved):** No Sentry SDK integration existed in code; errors relied on console + logs.

**Resolution (implemented, 2026-02-05):**
- Sentry configured for errors only via Next instrumentation:
  - `instrumentation.ts`
  - `instrumentation-client.ts`
  - `sentry.client.config.ts`
- Debt item resolved and archived: `docs/_archive/debt/debt-101-add-sentry-error-tracking.md`

#### 4) Stripe webhook coverage missing `invoice.payment_succeeded`

**Evidence:** `src/adapters/gateways/stripe/stripe-webhook-processor.ts` handles `invoice.payment_failed` but not `invoice.payment_succeeded`.

**Why this matters:** After payment recovery, subscription state can remain stale if we only rely on `customer.subscription.updated`.

**Resolution (proposed):**
- Treat `invoice.payment_succeeded` the same way as `invoice.payment_failed` (parse subscription ref, retrieve subscription, normalize update).

#### 5) No background subscription reconciliation

**Evidence:** No scheduled job exists to reconcile local subscription state with Stripe when webhook processing fails permanently.

**Resolution (proposed):**
- Add a periodic reconciliation job (cron) that:
  - pulls recent Stripe subscriptions (or per-user checks),
  - compares to local `stripe_subscriptions`,
  - upserts discrepancies with strong audit logging.

---

### P2 — Fix this sprint

#### 6) Duplicate navigation implementations (AppShell appears unused)

**Evidence:** `components/app-shell/app-shell.tsx` is not imported by any route/layout; `app/(app)/app/layout.tsx` has separate nav rendering.

**Resolution (proposed):**
- Pick one:
  - Use `AppShell` in `app/(app)/app/layout.tsx` and delete the duplicated markup, or
  - Delete `AppShell` (and its tests) if we intend to keep the inline layout.

#### 7) No active navigation state (desktop + mobile)

**Evidence:** `app/(app)/app/layout.tsx` and `components/mobile-nav.tsx` don’t indicate the current route.

**Note:** `components/app-shell/app-shell.tsx` supports active-state styling via `activePath`, but it is not wired into the current app layout, so users still don’t see an active nav state in the live navigation.

**Resolution (proposed):**
- Add active-state styling and `aria-current="page"` for the current page in both desktop and mobile nav.

#### 8) Theme toggle is implemented but not rendered

**Evidence:** `components/theme-toggle.tsx` exists but is not imported anywhere.

**Resolution (proposed):**
- Render `ThemeToggle` in the authenticated app header (and/or marketing header), with design-consistent styling.

#### 9) Missing route-specific `error.tsx` files

**Evidence:** Only these nested routes have `error.tsx`:
- `app/(app)/app/dashboard/error.tsx`
- `app/(app)/app/practice/error.tsx`
- `app/(app)/app/billing/error.tsx`

Routes lacking contextual error boundaries include: review, bookmarks, questions/[slug], pricing, checkout success.

**Resolution (proposed):**
- Add `error.tsx` for each missing nested route with a contextual message + recovery CTA.

#### 10) `.env.test` is committed (confirmed intentional)

**Evidence:** `.env.test` exists and contains dummy keys and local test DB URL.

**Assessment:** This appears **intentional** and non-secret. No action required unless policy changes (option: replace with `.env.test.example` + local generation).

#### 11) User email sync can still race between webhooks and request-time upserts

**Evidence:**
- Webhook path passes `observedAt` (see archived `DEBT-084`).
- `src/adapters/gateways/clerk-auth-gateway.ts` calls `userRepository.upsertByClerkId(clerkUser.id, email)` without an authoritative timestamp from Clerk.
- `src/adapters/repositories/drizzle-user-repository.ts` defaults `observedAt` to `now()` when not provided.

**Why this matters:** If the auth gateway observes stale Clerk user data, it can overwrite a newer email written by the webhook.

**Resolution (proposed):**
- Extend the auth gateway’s Clerk user shape to include `updated_at` and pass `observedAt` through to `upsertByClerkId`.
- Alternatively, stop mutating email in request-time auth flow and rely solely on webhooks for email sync.

#### 12) Idempotency cached results are not runtime-validated

**Evidence:** `src/adapters/shared/with-idempotency.ts` returns `existing.resultJson as T`.

**Resolution (proposed):**
- Store an envelope `{ version, value }` and validate `value` via Zod at read time, or
- Provide an optional `parseResult` function to `withIdempotency`.

#### 13) Additional Stripe event coverage gaps

**Evidence:** No handling for `checkout.session.expired` or `customer.subscription.trial_will_end`.

**Resolution (proposed):**
- Add minimal handlers (even if just business-event logging) or document explicitly as out of scope.

#### 14) Review pagination lacks context

**Evidence:** `app/(app)/app/review/page.tsx` shows Previous/Next without “Showing X–Y of Z”.

**Resolution (proposed):**
- Extend the controller/use-case to return `totalCount`, and render contextual pagination.

#### 15) “Start session” button has no loading text

**Evidence:** `app/(app)/app/practice/page.tsx` disables button during pending but label stays “Start session”.

**Resolution (proposed):**
- Show “Starting…” while pending (match billing button behavior).

#### 16) Inconsistent CTA/button styling across app

**Evidence:** Multiple CTA patterns exist (`bg-zinc-100`, `border`, `MetallicCtaButton`).

**Resolution (proposed):**
- Define a consistent primary/secondary/tertiary hierarchy using the shared `Button` variants and/or a small design-token policy.

#### 17) Vendor naming leaks into application ports and domain comments

**Evidence:**
- `src/application/ports/gateways.ts` uses `stripeCustomerId`, `stripeSubscriptionId`.
- `src/domain/value-objects/subscription-status.ts` comment references Stripe docs.

**Resolution (proposed):**
- Rename to vendor-agnostic `externalCustomerId`, `externalSubscriptionId` (with adapter mapping), and remove vendor-specific domain comments.

---

### P3–P4 — Backlog / nice-to-haves (verified, lower urgency)

- Bookmark mutation rate limit config exists but is not applied in `src/adapters/controllers/bookmark-controller.ts` (rate limiter is never called).
- Bookmark toggle label uses “Bookmarked” vs “Bookmark” in `app/(app)/app/practice/page.tsx` (prefer “Remove bookmark” / “Bookmark”).
- Mobile nav has no focus-management (e.g., escape-to-close, focus trap) and no active-route highlighting.
- Repository adapter tests heavily assert call shapes (fragile refactors); consider shifting key behavior verification to integration tests.
- Attempts table lacks a composite index for the common `(practiceSessionId, userId)` filter path (see `db/schema.ts` and `DrizzleAttemptRepository.findBySessionId`).
- CSP headers not configured (`next.config.ts`).
- No `security.txt` (repo currently has no `public/.well-known/` directory).
- Marketing `#features` anchor jumps without smooth scrolling.
- Error pages have no “Report issue” link.
- Health endpoint has no rate limit.

---

## Corrections / Notes

- The claim “only 4 `aria-label` instances” is inaccurate in this repo (there are more), but broader accessibility coverage is still a valid improvement area.
- `next.config.js` is referenced in the audit notes; the actual file is `next.config.ts`.

---

## Related

- ✅ `DEBT-101` — Sentry error tracking (resolved, archived)
- `docs/specs/spec-016-observability.md`
- `docs/_archive/debt/debt-084-user-email-race-condition.md`
