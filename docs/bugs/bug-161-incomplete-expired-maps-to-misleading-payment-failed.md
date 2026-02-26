# BUG-161: Stripe `incomplete_expired` Routes to Misleading `payment_processing` Messaging

**Status:** Open
**Priority:** P3
**Date:** 2026-02-25

---

## Description

`incomplete_expired` (terminal checkout failure) is mapped to domain status `paymentFailed`, but both entitlement and checkout-success routing currently treat `paymentFailed` like `paymentProcessing`.

That sends users to `/pricing?reason=payment_processing` with the banner:
"Payment processing. It may take a moment for access to activate."

For an expired checkout this is misleading; the user must re-subscribe.

## Verified Caller Chain

1. Stripe status `incomplete_expired` enters via webhook/checkout sync.
2. `stripe-subscription-status.ts:9` maps it to `paymentFailed`.
3. Non-entitled routing currently groups `paymentFailed` with `paymentProcessing`.
4. User is redirected with `reason=payment_processing` instead of a terminal reason.

## Root Cause

This is a **reason-mapping bug**, not a Stripe-status parsing bug.

`src/application/use-cases/check-entitlement.ts:24`:

```ts
if (status === 'paymentProcessing' || status === 'paymentFailed') {
  return 'payment_processing';
}
```

And the same grouping exists in `app/(marketing)/checkout/success/checkout-success-sync.tsx:245`.

## Impact

- Users with terminal failed checkouts are told to wait instead of retry checkout.
- Entitlement safety is intact (access is still denied).
- Conversion/recovery suffers because the CTA/message is wrong for this state.

## Scope

- `incomplete` and `incomplete_expired` are already distinct in mapping:
  - `incomplete` → `paymentProcessing`
  - `incomplete_expired` → `paymentFailed`
- The bug is downstream: **routing reasons collapse both to `payment_processing`**.
- Existing test `check-entitlement.test.ts:120–138` currently encodes this incorrect behavior.

## Fix (Minimal, SSOT-Aligned)

Do not add new domain statuses. Keep `paymentFailed` and route it as terminal.
No DB migration is required.

### Messaging Note

Using `subscription_required` keeps the fix minimal and correct. It is more accurate than `payment_processing` for terminal failed checkout states.
If product later wants more specific copy ("Checkout expired, please subscribe again"), introduce a dedicated reason code in a follow-up change.

### 1. Entitlement Reason Mapping

`src/application/use-cases/check-entitlement.ts`:

```ts
if (!hasActiveSubscriptionPeriod) return 'subscription_required';
if (status === 'paymentProcessing') return 'payment_processing';
if (status === 'paymentFailed') return 'subscription_required';
return 'manage_billing';
```

### 2. Checkout Success Redirect Mapping

`app/(marketing)/checkout/success/checkout-success-sync.tsx:244–249`:

```ts
const reason =
  status === 'paymentProcessing'
    ? 'payment_processing'
    : status === 'paymentFailed'
      ? 'subscription_required'
      : 'manage_billing';
```

### 3. Tests

- `src/application/use-cases/check-entitlement.test.ts`
  - Update `paymentFailed` case to expect `subscription_required`.
  - Keep `paymentProcessing` case expecting `payment_processing`.
- `app/(marketing)/checkout/success/page.test.ts`
  - Add `incomplete_expired` fixture path asserting redirect to
    `${ROUTES.PRICING}?reason=subscription_required`.
- Keep `incomplete` path asserting `payment_processing` (regression guard).

## Verification

- [ ] Unit test: `paymentFailed` with active period returns `subscription_required`
- [ ] Unit test: `paymentProcessing` remains `payment_processing`
- [ ] Unit test: checkout success with Stripe `incomplete_expired` redirects to `reason=subscription_required`
- [ ] Unit test: checkout success with Stripe `incomplete` still redirects to `reason=payment_processing`
- [ ] Regression: existing non-entitled billing statuses still map to `manage_billing`

## Tracer-Bullet Verification (2026-02-26)

Vertical path verified in code:
`stripe-subscription-status.ts` → `drizzle-subscription-repository.ts` / checkout sync →
`check-entitlement.ts` and `checkout-success-sync.tsx` reason routing →
`app/pricing/page.tsx` banner rendering.

## Related

- `src/adapters/gateways/stripe/stripe-subscription-status.ts:7–27`
- `src/application/use-cases/check-entitlement.ts:19–28`
- `src/application/use-cases/check-entitlement.test.ts:120–138`
- `app/(marketing)/checkout/success/checkout-success-sync.tsx:244–249`
- `app/(marketing)/checkout/success/page.test.ts:694+`
- `app/pricing/page.tsx:114–120`
- BUG-077 (historical context; this bug narrows terminal-state handling)
