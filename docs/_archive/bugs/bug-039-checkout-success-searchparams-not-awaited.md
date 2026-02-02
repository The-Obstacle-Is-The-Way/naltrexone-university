# BUG-039: Checkout Success Page Crashes — searchParams Not Awaited

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The checkout success page crashed after a successful Stripe payment because it accessed `searchParams.session_id` without awaiting `searchParams` (Next.js 15+ makes `searchParams` a Promise). This prevented eager subscription sync and caused a fallback redirect to the pricing error banner.

## Steps to Reproduce

1. Go to `/pricing` while logged in
2. Click "Subscribe Monthly" or "Subscribe Annual"
3. Complete Stripe checkout with test card `4242 4242 4242 4242`
4. Observe redirect to `/pricing?checkout=error` instead of dashboard

## Root Cause

In Next.js 15+, `searchParams` in server components is now a Promise that must be awaited before accessing properties. The checkout success page was written for Next.js 14 where `searchParams` was synchronous.

**Location:** `app/(marketing)/checkout/success/page.tsx:167-172`

```typescript
// CURRENT (broken)
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };  // Wrong type
}) {
  await syncCheckoutSuccess({ sessionId: searchParams.session_id ?? null });  // Not awaited
  // ...
}
```

## Fix

Update the component to await `searchParams` before reading `session_id`, and export a small testable wrapper that supports dependency injection:

```typescript
// FIXED
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;  // Correct type
}) {
  const resolvedParams = await searchParams;  // Await first
  await syncCheckoutSuccess({ sessionId: resolvedParams.session_id ?? null });
  // ...
}
```

## Verification

- [x] Unit test added (`app/(marketing)/checkout/success/page.test.ts`)
- [ ] Manual verification: complete Stripe checkout, confirm redirect to dashboard
- [ ] Verify subscription appears in database after checkout

## Impact

- **User impact:** High — all new subscription attempts fail at the final step
- **Data impact:** Medium — webhook still processes, but eager sync fails
- **Workaround:** Users can refresh or navigate to dashboard manually; webhook eventually syncs subscription

## Related

- Next.js 15 migration guide: https://nextjs.org/docs/messages/sync-dynamic-apis
- `app/pricing/page.tsx` already handles this correctly (line 109)
- Webhook path still works, so subscriptions are eventually consistent
