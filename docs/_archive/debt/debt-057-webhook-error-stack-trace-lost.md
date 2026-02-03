# DEBT-057: Webhook Error Stack Trace Lost in Database

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Stripe webhook failures were difficult to debug if only a short message was persisted.

## Impact

- Debugging webhook failures requires reproducing the error
- No visibility into where in the code the error occurred
- Non-Error objects (e.g., Zod validation errors) lose all detail
- Production debugging is harder

## Resolution

Persist richer error data for failed webhook events:

- `src/adapters/controllers/stripe-webhook-controller.ts` captures `name`, `message`, and a truncated `stack`.
- Application errors also persist `code` and `fieldErrors` when present.
- The error is stored as a JSON string in `stripe_events.error` for backward compatibility with the existing schema.

## Verification

- [x] Unit tests pass (`stripe-webhook-controller.test.ts`).
- [x] Failed events persist a stack trace payload.

## Related

- `src/adapters/controllers/stripe-webhook-controller.ts`
- `db/schema.ts` — stripeEvents.error column
- DEBT-039: Error Context Loss in Stripe Webhook Failures (related)
