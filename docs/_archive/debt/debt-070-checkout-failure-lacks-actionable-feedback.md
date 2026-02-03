# DEBT-070: Checkout Failure Lacks Actionable Feedback

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

When Stripe checkout fails, users see only "Checkout failed. Please try again." with no indication of what went wrong. The actual error is logged to the server console but not surfaced in a developer-friendly way.

This makes debugging configuration issues (missing price IDs, invalid API keys, etc.) unnecessarily difficult.

## Current Flow

```
User clicks "Subscribe"
→ createCheckoutSession() fails
→ Error logged to server console (easy to miss)
→ Redirect to /pricing?checkout=error
→ UI shows "Checkout failed. Please try again."
→ Developer has no idea why
```

## Location

- `app/pricing/subscribe-action.ts` — Builds the error redirect URL
- `app/pricing/page.tsx` — Builds the pricing banner based on URL params
- `app/pricing/subscribe-actions.ts` — Wires server actions and logging

## Impact

- **Developer confusion:** Common config issues (missing Stripe price IDs) are hard to diagnose
- **Time wasted:** Must dig through server logs to find actual error
- **Poor DX:** First-time setup is frustrating when checkout silently fails

## Common Root Causes (Not Code Bugs)

| Cause | How to Diagnose |
|-------|-----------------|
| `NEXT_PUBLIC_STRIPE_PRICE_ID_*` not set | Check `.env` for placeholder values |
| Price IDs don't exist in Stripe | Verify in Stripe Dashboard → Products |
| Test/Live key mismatch | All keys must be same mode (test or live) |
| Stripe customer creation failed | Check server logs for Stripe API error |

## Recommended Fix

Implemented a dev-mode error banner and improved redirect diagnostics:

- `runSubscribeAction()` now redirects to `/pricing?checkout=error&plan=...&error_code=...` on non-auth errors.
- In development only, the redirect includes a truncated `error_message` (200 chars) and the pricing banner renders `Checkout failed (<code>). <message>`.
- `subscribeMonthlyAction`/`subscribeAnnualAction` inject structured logging (via `lib/logger`) without polluting unit test output.

Additionally, environment validation now rejects Stripe price IDs that do not start with `price_` to catch common misconfiguration early.

## Verification

- [x] Developer can see `error_code` in the redirect URL.
- [x] Clear error message shown in development mode (no production info leak).
- [x] Unit tests updated and passing (`app/pricing/page.test.tsx`, `app/pricing/subscribe-actions.test.ts`).

## Related

- DEBT-067: Generic Error Page Lacks Error Details
- `.env.example` documents required Stripe variables
