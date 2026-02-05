# DEBT-100: Adversarial Codebase Audit Backlog (2026-02-04)

**Status:** Resolved
**Priority:** P0
**Date:** 2026-02-04
**Resolved:** 2026-02-05
**Archived:** 2026-02-05

---

## Description

A multi-agent adversarial audit (auth, UI/UX, architecture, data integrity, feature completeness) identified the following backlog items. This document records **verified** findings, corrects any inaccurate claims, and defines concrete next steps.

**Scope note:** This is an evolving backlog document. Fixes land in follow-up PRs; this doc should be updated as items are resolved.

---

## Verified Findings (by priority)

### P0 — Ship blockers

#### 1) ✅ Checkout customer creation is retry-safe (non-atomic, convergent)

**Evidence:** `src/application/use-cases/create-checkout-session.ts` creates a Stripe customer and then inserts the mapping in a second step (`getOrCreateStripeCustomerId()`).

**Why this matters:** If the DB insert fails after Stripe customer creation succeeds, we can temporarily (or permanently) end up with:
- an orphan Stripe customer (no local mapping), and
- potential duplicate customers if retries happen outside Stripe’s idempotency retention window.

**Current mitigations (good but not perfect):**
- Stripe idempotency key is used (`stripe_customer:${userId}`)
- DB insert is conflict-safe in the repository layer

**Resolution (implemented, 2026-02-05):**
- Keep Stripe idempotency keys (best-effort).
- Add a deterministic lookup fallback before creating a new Stripe customer:
  - Search Stripe customers by `metadata.user_id` and reuse the single match.
  - Hard-fail if multiple matches exist (indicates data integrity issues).
  - Only create a new customer when no match exists.

**Files:**
- `src/adapters/gateways/stripe/stripe-customers.ts`
- `src/adapters/gateways/stripe-payment-gateway.test.ts`

**Verification:**
- Unit: gateway customer creation reuses an existing Stripe customer found via metadata search.

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

#### 4) ✅ Stripe webhook coverage includes `invoice.payment_succeeded`

**Evidence:** `src/adapters/gateways/stripe/stripe-webhook-processor.ts` handles `invoice.payment_failed` but not `invoice.payment_succeeded`.

**Why this matters:** After payment recovery, subscription state can remain stale if we only rely on `customer.subscription.updated`.

**Resolution (implemented, 2026-02-05):**
- Handle `invoice.payment_succeeded` and normalize it to a `subscriptionUpdate` (same strategy as `invoice.payment_failed`).

**Files:**
- `src/adapters/gateways/stripe/stripe-webhook-processor.ts`
- `src/adapters/gateways/stripe/stripe-webhook-schemas.ts`
- `src/adapters/gateways/stripe-payment-gateway.test.ts`

#### 5) ✅ Subscription reconciliation job + cron route

**Evidence:** No scheduled job exists to reconcile local subscription state with Stripe when webhook processing fails permanently.

**Resolution (implemented, 2026-02-05):**
- Add a reconciliation job that scans local Stripe subscription rows and refreshes canonical state from Stripe.
- Expose a protected cron route gated by `CRON_SECRET`.

**Files:**
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
- `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
- `app/api/cron/reconcile-stripe-subscriptions/route.ts`
- `lib/env.ts` (optional `CRON_SECRET`)
- `.env.example` (placeholder `CRON_SECRET=`)

---

### P2 — Fix this sprint

#### 6) ✅ Duplicate navigation removed

**Previous evidence (resolved):** `components/app-shell/app-shell.tsx` was unused while `app/(app)/app/layout.tsx` rendered a separate navigation.

**Resolution (implemented, 2026-02-05):**
- Remove the unused `AppShell` implementation.
- Centralize navigation items and render them via shared desktop + mobile components.

**Files:**
- `components/app-nav-items.ts`
- `components/app-desktop-nav.tsx`
- `components/mobile-nav.tsx`
- `app/(app)/app/layout.tsx`
- Deleted: `components/app-shell/app-shell.tsx`, `components/app-shell/app-shell.test.tsx`

#### 7) ✅ Active navigation state (desktop + mobile)

**Resolution (implemented, 2026-02-05):**
- Active route styling + `aria-current="page"` in desktop and mobile nav.
- Mobile nav includes escape-to-close and keyboard focus management (covered by browser tests).

**Files:**
- `components/app-desktop-nav.tsx`
- `components/mobile-nav.tsx`
- `components/mobile-nav.browser.spec.tsx`

#### 8) ✅ Theme toggle rendered

**Previous evidence (resolved):** `components/theme-toggle.tsx` existed but was not rendered.

**Resolution (implemented, 2026-02-05):**
- Render `ThemeToggle` in the authenticated app header.

**File:**
- `app/(app)/app/layout.tsx`

#### 9) ✅ Route-specific `error.tsx` boundaries added

**Resolution (implemented, 2026-02-05):**
- Add contextual route error boundaries for:
  - review, bookmarks, questions/[slug], pricing, checkout success
- Add a “Report issue” link across error boundaries.

**Files:**
- `app/(app)/app/bookmarks/error.tsx`
- `app/(app)/app/review/error.tsx`
- `app/(app)/app/questions/[slug]/error.tsx`
- `app/pricing/error.tsx`
- `app/(marketing)/checkout/success/error.tsx`
- `lib/support.ts`

#### 10) `.env.test` is committed (confirmed intentional)

**Evidence:** `.env.test` exists and contains dummy keys and local test DB URL.

**Assessment:** This appears **intentional** and non-secret. No action required unless policy changes (option: replace with `.env.test.example` + local generation).

#### 11) ✅ User email sync uses authoritative timestamps (`observedAt`)

**Previous evidence (resolved):** Request-time auth upserts could overwrite a fresher email written by the webhook.

**Resolution (implemented, 2026-02-05):**
- `ClerkAuthGateway.getCurrentUser()` extracts Clerk `updatedAt/updated_at` and passes it through to `UserRepository.upsertByClerkId(..., { observedAt })`.

**Files:**
- `src/adapters/gateways/clerk-auth-gateway.ts`
- `src/adapters/gateways/clerk-auth-gateway.test.ts`

#### 12) ✅ Idempotency cached results are runtime-validated

**Previous evidence (resolved):** `withIdempotency()` returned cached results via `as T` with no validation.

**Resolution (implemented, 2026-02-05):**
- Add optional `parseResult` to `withIdempotency()` and validate cached results via Zod where used.

**Files:**
- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/shared/with-idempotency.test.ts`
- `src/adapters/controllers/billing-controller.ts`
- `src/adapters/controllers/practice-controller.ts`
- `src/adapters/controllers/question-controller.ts`

#### 13) ✅ Additional Stripe event coverage added

**Previous evidence (resolved):** No handling for `checkout.session.expired` or `customer.subscription.trial_will_end`.

**Resolution (implemented, 2026-02-05):**
- Add minimal handlers for:
  - `checkout.session.expired` (expire the checkout session)
  - `customer.subscription.trial_will_end` (normalize subscription update)

**Files:**
- `src/adapters/gateways/stripe/stripe-webhook-processor.ts`
- `src/adapters/gateways/stripe/stripe-webhook-schemas.ts`
- `src/adapters/gateways/stripe-payment-gateway.test.ts`

#### 14) ✅ Review pagination includes total context

**Previous evidence (resolved):** Review pagination showed Previous/Next without “Showing X–Y of Z”.

**Resolution (implemented, 2026-02-05):**
- Add `totalCount` to the missed-questions flow and render contextual pagination.

**Files:**
- `src/application/use-cases/get-missed-questions.ts`
- `src/application/use-cases/get-missed-questions.test.ts`
- `src/application/ports/repositories.ts` (add `AttemptMissedQuestionsReader.countMissedQuestionsByUserId`)
- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `src/application/test-helpers/fakes.ts`
- `app/(app)/app/review/page.tsx`
- `app/(app)/app/review/page.test.tsx`

#### 15) ✅ “Start session” button shows loading text

**Previous evidence (resolved):** Button disabled while pending but label stayed “Start session”.

**Resolution (implemented, 2026-02-05):**
- Show “Starting…” while pending.

**Files:**
- `app/(app)/app/practice/page.tsx`
- `app/(app)/app/practice/page.test.tsx`

#### 16) ✅ Accepted: multiple CTA styles (intentional hierarchy)

**Assessment:** This is not a correctness bug. The app intentionally uses multiple CTA styles to represent hierarchy:
- **Primary marketing CTA:** `MetallicCtaButton`
- **App actions:** `Button` variants (default/outline, etc.)
- **Secondary marketing CTA:** neutral high-contrast CTA (e.g., `bg-zinc-100`) on dark backgrounds

If we later want stricter uniformity, track it as a design-system follow-up rather than blocking shipping.

#### 17) ✅ Vendor-agnostic naming in application ports (external IDs)

**Previous evidence (resolved):** Application ports used `stripeCustomerId` / `stripeSubscriptionId`, and a domain comment referenced Stripe docs.

**Resolution (implemented, 2026-02-05):**
- Rename application-layer ports to vendor-agnostic names:
  - `externalCustomerId`
  - `externalSubscriptionId`
- Remove the vendor-specific domain comment.

**Files:**
- `src/application/ports/gateways.ts`
- `src/application/ports/repositories.ts`
- `src/domain/value-objects/subscription-status.ts`
- `docs/specs/spec-004-application-ports.md`
- `docs/specs/spec-009-payment-gateway.md`

---

### P3–P4 — Backlog / nice-to-haves (verified, lower urgency)

- ✅ Bookmark mutation rate limiting is enforced.
- ✅ Bookmark toggle copy uses “Remove bookmark” / “Bookmark”.
- ✅ Mobile nav includes focus management + active route styling (browser-tested).
- ✅ Attempts table includes a composite index for `(practiceSessionId, userId, answeredAt DESC)`.
- ✅ Baseline CSP + security headers configured.
- ✅ `security.txt` added.
- ✅ Smooth scroll enabled (respects reduced motion).
- ✅ Error UIs include a “Report issue” link.
- ✅ Health endpoint is rate-limited.
- Accepted (follow-up): repository adapter unit tests assert call shapes; consider shifting key behavior verification to integration tests over time.

---

## Corrections / Notes

- The claim “only 4 `aria-label` instances” is inaccurate in this repo (there are more), but broader accessibility coverage is still a valid improvement area.
- `next.config.js` is referenced in the audit notes; the actual file is `next.config.ts`.

---

## Related

- ✅ `DEBT-101` — Sentry error tracking (resolved, archived)
- `docs/specs/spec-016-observability.md`
- `docs/_archive/debt/debt-084-user-email-race-condition.md`
