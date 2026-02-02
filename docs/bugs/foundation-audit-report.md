# Foundation Audit Report

**Date:** 2026-02-02
**Auditor:** Comprehensive vertical/horizontal trace of all critical paths
**Purpose:** Identify ALL foundational issues before building more features

---

## Executive Summary

Despite having 17 detailed specs and 39 resolved bugs, **the core subscription flow is broken**. Users complete Stripe payments but cannot access the app. This audit traces every critical path to identify ALL remaining gaps.

### Current State

| Category | Count | Impact |
|----------|-------|--------|
| **P1 Blockers** | 1 | Revenue blocked - can't subscribe |
| **P2 Issues** | 3 | Degraded experience |
| **P3 Issues** | 1 | Minor |
| **Working Correctly** | 10+ flows | Core app logic solid |

---

## Critical Path Analysis

### 1. Subscription Flow — **BROKEN (P1)**

```
User Journey:
/pricing → Subscribe → Stripe → /checkout/success → /app/dashboard
                                      ↓
                              FAILS SILENTLY
                                      ↓
                        /pricing?checkout=error
```

**Root Cause Chain:**

| Step | Status | Issue |
|------|--------|-------|
| Pricing page loads | ✅ | Works |
| Subscribe button works | ✅ | Redirects to sign-up if needed |
| User signs up via Clerk | ⚠️ | Works, but "infinite redirect" warning appears |
| Checkout session created | ✅ | Stripe receives correct data |
| User pays on Stripe | ✅ | Payment succeeds |
| Return to /checkout/success | ❌ | **8 silent validation checks, no logging** |
| Webhook processes | ⚠️ | `subscription.created` returns 500 (BUG-041) |

**Issues Found:**

1. **BUG-042 (P1):** `app/(marketing)/checkout/success/page.tsx:118-155`
   - 8 validation checks all redirect to same error URL
   - ZERO logging before redirects
   - Impossible to diagnose which check fails

2. **BUG-043 (P2 - NEW):** `/checkout/success` not in public routes
   - `proxy.ts:3-11` missing `/checkout/success(.*)`
   - May cause auth issues when returning from Stripe

3. **BUG-041 (P2):** Webhook 500 on `subscription.created`
   - `src/adapters/gateways/stripe-payment-gateway.ts:232-237`
   - `metadata.user_id` not set when event fires (race condition)

---

### 2. Authentication Flow — **DEGRADED (P2)**

```
User Journey:
/sign-up → Clerk → User in DB → /app/dashboard
```

| Step | Status | Issue |
|------|--------|-------|
| Sign-up page loads | ✅ | Clerk component renders |
| User creates account | ✅ | Works |
| User record in DB | ✅ | `upsertByClerkId` works |
| Session management | ⚠️ | Intermittent "infinite redirect" warnings |

**Issues Found:**

1. **BUG-040 (P2):** Clerk session token refresh warning
   - Appears intermittently in server logs
   - Auth still works, but indicates potential key mismatch
   - `lib/env.ts:81-85` has dummy key fallbacks that mask config errors

2. **Environment Variable Fallbacks (P3):**
   ```typescript
   // lib/env.ts:81-85
   CLERK_SECRET_KEY: parsed.data.CLERK_SECRET_KEY ?? 'sk_test_dummy',
   ```
   - Allows app to boot with invalid keys
   - Fails silently at runtime

---

### 3. Core App Flow — **WORKING ✅**

```
User Journey (after subscription):
/app/dashboard → /app/practice → Answer Questions → /app/review
```

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard loads | ✅ | Stats calculated correctly |
| Recent activity | ✅ | Handles missing questions gracefully |
| Practice session start | ✅ | Entitlement checked |
| Get next question | ✅ | Filters by tags, avoids repeats |
| Submit answer | ✅ | Grading logic correct |
| Bookmarks | ✅ | Add/remove/view works |
| Review missed | ✅ | Pagination works |
| Billing page | ✅ | Shows subscription status |

**All wired correctly:**
- Controllers check entitlements
- Use cases have proper dependencies
- Repositories persist/retrieve correctly
- Error states handled in UI

---

### 4. Webhook Handling — **PARTIALLY WORKING (P2)**

| Webhook | Status | Notes |
|---------|--------|-------|
| `checkout.session.completed` | ✅ | Syncs subscription |
| `customer.subscription.updated` | ✅ | Updates status |
| `customer.subscription.deleted` | ✅ | Marks as canceled |
| `customer.subscription.created` | ❌ | 500 error (BUG-041) |
| `customer.subscription.paused` | ✅ | Added in BUG-025 fix |
| `invoice.payment_failed` | ✅ | Handled |
| Clerk `user.created` | ✅ | Syncs user |
| Clerk `user.deleted` | ✅ | Cleans up data |

---

### 5. Question Content Pipeline — **WORKING ✅**

```
MDX Files → Parser → Seed Script → Database → Practice Flow
```

| Step | Status | Notes |
|------|--------|-------|
| MDX files exist | ✅ | `content/questions/` |
| Parser validates | ✅ | Frontmatter checked |
| Seed script | ✅ | `pnpm db:seed` works |
| Questions in DB | ✅ | All 4 layers retrieved correctly |

---

## Issues Inventory

### Active Bugs (Open)

| ID | Priority | Title | File | Line |
|----|----------|-------|------|------|
| BUG-042 | **P1** | Checkout success silent failure | `checkout/success/page.tsx` | 118-155 |
| BUG-043 | P2 | Missing public route for checkout | `proxy.ts` | 3-11 |
| BUG-041 | P2 | Webhook 500 on subscription.created | `stripe-payment-gateway.ts` | 232-237 |
| BUG-040 | P2 | Clerk session token warning | `.env.local` | - |

### Potential Issues (Need Verification)

| Issue | File | Risk |
|-------|------|------|
| Dummy key fallbacks mask config errors | `lib/env.ts:81-85` | P3 |
| No integration test for checkout flow | - | P3 |

### Resolved (Archived) — 39 bugs

All previously identified issues have been fixed and archived.

---

## Route Inventory

### All Routes Referenced in Code

| Route | Page Exists | Accessible |
|-------|-------------|------------|
| `/` | ✅ | ✅ Public |
| `/pricing` | ✅ | ✅ Public |
| `/sign-in` | ✅ | ✅ Public |
| `/sign-up` | ✅ | ✅ Public |
| `/checkout/success` | ✅ | ⚠️ **Not in public routes** |
| `/app/dashboard` | ✅ | ✅ Protected |
| `/app/practice` | ✅ | ✅ Protected |
| `/app/billing` | ✅ | ✅ Protected |
| `/app/bookmarks` | ✅ | ✅ Protected |
| `/app/review` | ✅ | ✅ Protected |

### API Routes

| Route | Status |
|-------|--------|
| `/api/stripe/webhook` | ✅ Public |
| `/api/webhooks/clerk` | ✅ Public |
| `/api/health` | ✅ Public |

---

## Code Quality Check

### TODO/FIXME Comments
**None found** — all previously marked items have been addressed.

### Type Safety Escapes
```
as unknown as ClerkRequestLike  — lib/api/webhooks/clerk (acceptable for lib interop)
as unknown as ClerkWebhookEvent — lib/api/webhooks/clerk (acceptable for lib interop)
globalThis as unknown as        — lib/db.ts (standard singleton pattern)
```
**All acceptable** — no `as any` or `@ts-ignore` found.

### Console Statements
Found only in error boundary components (appropriate):
- `app/(app)/app/dashboard/error.tsx`
- `app/(app)/app/practice/error.tsx`
- `app/(app)/app/billing/error.tsx`
- `app/error.tsx`
- `app/global-error.tsx`
- `app/api/health/route.ts`

---

## Recommendations

### Immediate (Fix Today)

1. **Add `/checkout/success(.*)` to public routes** in `proxy.ts`
2. **Add logging to checkout success validation** to identify which check fails
3. **Test checkout flow end-to-end** after fixes

### Short-Term (This Week)

4. Handle `subscription.created` webhook gracefully (skip if no user_id)
5. Verify Clerk keys match between dashboard and `.env.local`
6. Remove or gate dummy key fallbacks in `lib/env.ts`

### Medium-Term

7. Add integration test for complete subscription flow
8. Add E2E test for checkout → dashboard journey
9. Add health check that verifies Clerk/Stripe connectivity

---

## Conclusion

The codebase architecture is solid — Clean Architecture layers are properly separated, controllers check entitlements, repositories work correctly, and the UI handles errors.

**The blocker is at the seam between Stripe and our app:**
- Payment succeeds ✅
- Webhook partially works ⚠️
- Checkout success page fails silently ❌

Once BUG-042 and BUG-043 are fixed, the app should work end-to-end.

---

## Appendix: Files Audited

### Critical Path Files
- `proxy.ts` — Clerk middleware, public routes
- `app/(marketing)/checkout/success/page.tsx` — Checkout completion
- `app/pricing/page.tsx` — Pricing page
- `app/pricing/subscribe-actions.ts` — Subscribe server action
- `src/adapters/gateways/stripe-payment-gateway.ts` — Stripe integration
- `src/adapters/gateways/clerk-auth-gateway.ts` — Auth integration
- `app/api/stripe/webhook/route.ts` — Webhook handler
- `app/(app)/app/layout.tsx` — App layout with entitlement check
- `lib/env.ts` — Environment variable handling
- `lib/container.ts` — Dependency injection

### All App Routes
- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/practice/page.tsx`
- `app/(app)/app/billing/page.tsx`
- `app/(app)/app/bookmarks/page.tsx`
- `app/(app)/app/review/page.tsx`
