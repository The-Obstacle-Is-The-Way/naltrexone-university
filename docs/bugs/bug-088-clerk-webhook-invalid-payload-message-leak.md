# BUG-088: Clerk Webhook Invalid-Payload Response Leaks Internal Error Message

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

For `INVALID_WEBHOOK_PAYLOAD`, the Clerk webhook route returns `error.message` directly to the caller. This mirrors the previously fixed Stripe webhook issue pattern (BUG-084) and can expose internal validation context externally.

## Root Cause

`app/api/webhooks/clerk/handler.ts` returns the raw application error message:

- `app/api/webhooks/clerk/handler.ts:109-115`

```typescript
if (isApplicationError(error) && error.code === 'INVALID_WEBHOOK_PAYLOAD') {
  return NextResponse.json({ error: error.message }, { status: 400 });
}
```

## Impact

- Public API surface leaks internal validation wording.
- Inconsistent with hardened Stripe webhook behavior (generic outward message, detailed server logs).

## Fix

Pending.

Recommended approach:
- Return a generic 400 message (for example, `"Webhook validation failed"`).
- Keep details in server logs only.
- Add regression tests similar to Stripe webhook route tests.

## Verification

- [ ] Invalid Clerk payload returns generic 400 message
- [ ] Internal details remain available in structured logs only
- [ ] Valid webhook processing unchanged

## Related

- `docs/_archive/bugs/bug-084-webhook-error-message-leaks-context.md`
- `src/adapters/controllers/clerk-webhook-controller.ts`
