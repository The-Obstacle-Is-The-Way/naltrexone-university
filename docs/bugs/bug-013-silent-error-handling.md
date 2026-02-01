# BUG-013: Silent Error Handling — Errors Swallowed Without Logging or User Feedback

**Status:** Open
**Priority:** P1
**Date:** 2026-02-01

---

## Description

Some failures in server actions/controllers are converted into generic `ActionResult` errors without logging the underlying exception, and the UI sometimes redirects without displaying any error context. This makes production debugging significantly harder and creates poor UX during checkout failures.

This is a **P1** bug because:
1. When checkout/session creation fails, the user has no actionable feedback
2. The underlying error context can be lost (no logs, no stack trace)
3. Debugging issues in production becomes slower and more expensive

---

## Issue 1: Unknown errors are mapped without logging

**File:** `src/adapters/controllers/action-result.ts`

**Current behavior:** `handleError()` converts non-ApplicationError, non-Zod errors into `{ code: 'INTERNAL_ERROR', message: 'Internal error' }` without logging the original error.

**Why this matters:** Controllers typically `catch` and return an `ActionResult`, which prevents the platform/runtime from logging the exception automatically.

**Recommended fix (Clean Architecture-friendly):**
- Add a logger dependency to controller deps (provided from `lib/container.ts`) and log unknown errors in the controller `catch` blocks before calling `handleError()`.
- Alternatively, add an optional `logError?: (error: unknown) => void` parameter to `handleError()` and pass it from controllers.

---

## Issue 2: Pricing Page Ignores Error State

**File:** `app/pricing/page.tsx`

**Current behavior:** When checkout session creation fails, the action redirects to `/pricing?checkout=error`, but the page does not render any message based on that query param.

**User Experience:**
1. Click "Subscribe Monthly"
2. Something fails
3. Page redirects to `/pricing?checkout=error`
4. User sees exact same page, no error message
5. User clicks again, same result
6. User gives up (lost revenue)

**Fix:** Accept `searchParams` and display an error/canceled banner when `checkout` is set.

---

## Issue 3: No Centralized Error Logging

The logger exists (`lib/logger.ts`) but controller-level errors that are converted into `ActionResult` responses are currently not logged.

| Component | Uses Logger? |
|-----------|-------------|
| `handleError()` | ❌ No |
| `billing-controller.ts` | ❌ No |
| `question-controller.ts` | ❌ No |
| `stripe-webhook-controller.ts` | ❌ No |

**Fix:**
All controllers should log errors before returning error responses.

---

## Issue 4: Other Silent Failure Patterns

### 4a. Checkout Success Page Silent Redirects

**File:** `app/(marketing)/checkout/success/page.tsx`

Multiple `redirectFn('/pricing')` calls with no logging:
```typescript
if (!stripeCustomerId || !subscriptionId) redirectFn('/pricing');  // Silent!
if (metadataUserId && metadataUserId !== user.id) redirectFn('/pricing');  // Silent!
```

User has no idea why they're back on pricing page.

### 4b. App Layout Silent Entitlement Redirect

**File:** `app/(app)/app/layout.tsx`

```typescript
if (!entitlement.isEntitled) {
  redirectFn('/pricing');  // No message explaining why
}
```

User doesn't know they need to subscribe.

---

## Impact

- **Revenue:** Users can't subscribe, no error tells them why
- **Debugging:** Zero visibility into production failures
- **Support:** Can't help users because errors aren't logged
- **Trust:** Silent failures feel like a broken product

---

## Resolution Plan

### Phase 1: Add Logging (Critical)
1. Update `handleError()` to log all errors before returning
2. Add request context (userId, action) to logs
3. Verify logs appear in Vercel dashboard

### Phase 2: Add User Feedback (High)
1. Update pricing page to show checkout errors
2. Add toast/banner for redirects with context
3. Add "contact support" links

### Phase 3: Structured Error Handling (Medium)
1. Create error boundary components
2. Add Sentry or similar for error tracking
3. Add request ID for correlation

---

## Verification

- [ ] `handleError()` logs all errors to console/Vercel
- [ ] Pricing page shows error message when `?checkout=error`
- [ ] Vercel logs show actual Stripe errors when checkout fails
- [ ] Users see helpful messages, not silent redirects

---

## Related

- DEBT-039: Error Context Loss in Stripe Webhook Failures
- BUG-011: UX Flow Gaps
- `lib/logger.ts` — Logger exists but unused
- `src/adapters/controllers/action-result.ts` — handleError swallows errors
