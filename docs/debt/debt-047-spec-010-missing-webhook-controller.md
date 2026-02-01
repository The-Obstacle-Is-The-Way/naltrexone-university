# DEBT-047: SPEC-010 Missing stripe-webhook-controller Documentation

**Status:** Open
**Priority:** P3
**Date:** 2026-02-01

---

## Description

SPEC-010 (Server Actions/Controllers) documents the expected controller files but does not mention `stripe-webhook-controller.ts`, which has been implemented and is actively used.

**SPEC-010 Lists:**
```
src/adapters/controllers/
├── action-result.ts
├── billing-controller.ts
├── question-controller.ts
├── practice-controller.ts
├── review-controller.ts
├── bookmark-controller.ts
├── stats-controller.ts
└── index.ts
```

**Actual Implementation:**
```
src/adapters/controllers/
├── action-result.ts          ✓ (documented)
├── billing-controller.ts     ✓ (documented)
├── question-controller.ts    ✓ (documented)
├── stripe-webhook-controller.ts  ✗ (NOT documented)
├── index.ts                  ✓ (documented)
```

The `stripe-webhook-controller.ts` is a critical component that handles Stripe webhook processing, event claiming, and subscription state updates.

## Impact

- **Incomplete documentation:** Controller layer appears smaller than it is
- **Discoverability:** Developers may not know where webhook logic lives
- **Specification accuracy:** Spec doesn't match implementation

## Location

- `docs/specs/spec-010-server-actions.md` (Files to Create section)

## Resolution

1. Add `stripe-webhook-controller.ts` to SPEC-010's file list
2. Document its responsibilities:
   - Webhook signature verification (via PaymentGateway)
   - Event idempotency (via StripeEventRepository)
   - Subscription state updates (via SubscriptionRepository)
   - Transaction boundary management

## Verification

- [ ] SPEC-010 lists `stripe-webhook-controller.ts`
- [ ] Controller responsibilities are documented
- [ ] File list matches actual implementation

## Related

- `src/adapters/controllers/stripe-webhook-controller.ts` - The controller
- SPEC-011 (Paywall) - References webhook handling
- `app/api/stripe/webhook/route.ts` - Route that calls the controller
