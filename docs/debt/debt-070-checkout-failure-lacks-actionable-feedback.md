# DEBT-070: Checkout Failure Lacks Actionable Feedback

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

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

- `app/pricing/subscribe-action.ts:27` — Redirects to error without preserving error info
- `app/pricing/page.tsx:66` — Shows generic "Checkout failed" message
- `src/adapters/controllers/action-result.ts:53` — Logs error but doesn't surface it

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

### Option A: Dev-Mode Error Banner (Recommended)

In development, show the actual error on the pricing page:

```typescript
// app/pricing/page.tsx
const checkoutError = searchParams.checkout === 'error'
  ? searchParams.error_code // Pass error code in redirect
  : null;

{checkoutError && process.env.NODE_ENV === 'development' && (
  <div className="bg-red-100 text-red-900 p-4 rounded">
    <strong>Dev Error:</strong> {decodeErrorCode(checkoutError)}
  </div>
)}
```

### Option B: Startup Validation

Validate Stripe config at app startup:

```typescript
// lib/stripe.ts
if (!env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY.startsWith('price_')) {
  console.warn('⚠️  NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY looks invalid');
}
```

### Option C: Better Logging

Add structured logging with clear context:

```typescript
logger.error({
  action: 'createCheckoutSession',
  userId: user.id,
  plan: parsed.data.plan,
  priceId: stripePriceIds[parsed.data.plan],
  err: error,
}, 'Checkout session creation failed');
```

## Verification

- [ ] Developer can diagnose missing price IDs without digging through logs
- [ ] Clear error message shown in dev mode
- [ ] Production still shows generic message (no info leak)

## Related

- DEBT-067: Generic Error Page Lacks Error Details
- `.env.example` documents required Stripe variables
