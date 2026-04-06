# BUG-232: Manage Billing Form Actions Still Drop Portal Idempotency Keys

**Status:** Resolved
**Priority:** P4
**Date:** 2026-04-03
**Confirmed:** 2026-04-03
**Component:** Billing / Server Actions / Stripe

---

## Description

BUG-204 added rate limiting and optional `idempotencyKey` support to `createPortalSession`, but the two UI-facing "Manage Billing" server actions still discard form input and call the controller with `{}`.

Observed behavior:

- Both pricing and app billing forms submit through wrappers that ignore `FormData`.
- The shared manage-billing core also hardcodes `createPortalSessionFn({})`.
- Duplicate UI submits therefore still create fresh Stripe portal sessions instead of replaying the same response.

Expected behavior:

- The idempotent portal-session path added in BUG-204 should be reachable from the actual pricing and billing forms.
- Duplicate submits of the same "Manage Billing" intent should reuse a stable idempotency key and replay the original portal URL.

## Impact

- Double-clicks or replayed form posts still create redundant Stripe billing portal sessions.
- This burns Stripe API budget and user-level portal-session rate-limit budget for duplicate intent.
- The blast radius is smaller than pre-BUG-204 because rate limiting now exists, but the UI contract is still not replay-safe.

## Steps to Reproduce

1. Open `/pricing` or `/app/billing` as an authenticated subscribed user.
2. Trigger "Manage Billing" and capture the outgoing server-action request.
3. Replay the same request, or submit twice quickly.
4. Observe the server action keeps creating fresh portal sessions until rate limiting intervenes.

## Root Cause

Tracer-bullet path:

1. [`src/adapters/controllers/billing-controller.ts`](../../src/adapters/controllers/billing-controller.ts) now accepts optional `idempotencyKey` and wraps portal creation in `withIdempotency(...)` when provided.
2. [`app/pricing/manage-billing-actions.ts`](../../app/pricing/manage-billing-actions.ts) ignores its `FormData` argument and forwards only injected deps.
3. [`app/(app)/app/billing/manage-billing-actions.ts`](../../app/(app)/app/billing/manage-billing-actions.ts) does the same.
4. [`lib/manage-billing/manage-billing-core.ts`](../../lib/manage-billing/manage-billing-core.ts) hardcodes `deps.createPortalSessionFn({})`.
5. [`lib/manage-billing/manage-billing-types.ts`](../../lib/manage-billing/manage-billing-types.ts) types `CreatePortalSessionFn` as `input: Record<string, never>`, preventing callers from threading an idempotency key through the shared helper.
6. The rendered pricing and billing forms in [`app/pricing/pricing-view.tsx`](../../app/pricing/pricing-view.tsx) and [`app/(app)/app/billing/page.tsx`](../../app/(app)/app/billing/page.tsx) do not emit any hidden idempotency field for manage-billing submits.

## Recommended Fix

- Add a hidden idempotency-key field to both manage-billing forms.
- Widen the shared `CreatePortalSessionFn` input type to accept optional `idempotencyKey`.
- Thread the parsed key through both server-action wrappers and `runManageBillingAction(...)`.
- Add regression tests proving duplicate submits with the same key replay the original portal-session result.

## Verification

- [x] Code-level tracer-bullet verified on 2026-04-03.
- [x] Existing manage-billing tests only cover redirect behavior; they do not assert forwarded input or replay safety.
- [x] Regression coverage added for form-data forwarding and key threading at core, action, and UI layers (PR #267).
- [x] `IdempotencyKeyField` extracted to `components/idempotency-key-field.tsx` as shared component (PR #267).
- [ ] Manual replay against a local or test Stripe environment.

## Related

- [`app/pricing/manage-billing-actions.ts`](../../app/pricing/manage-billing-actions.ts)
- [`app/(app)/app/billing/manage-billing-actions.ts`](../../app/(app)/app/billing/manage-billing-actions.ts)
- [`lib/manage-billing/manage-billing-core.ts`](../../lib/manage-billing/manage-billing-core.ts)
- [`lib/manage-billing/manage-billing-types.ts`](../../lib/manage-billing/manage-billing-types.ts)
- [`src/adapters/controllers/billing-controller.ts`](../../src/adapters/controllers/billing-controller.ts)
- [`docs/_archive/bugs/bug-204-billing-portal-missing-abuse-controls.md`](../_archive/bugs/bug-204-billing-portal-missing-abuse-controls.md)
