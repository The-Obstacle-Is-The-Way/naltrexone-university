# BUG-201: Clerk Webhook Handler Double-Cast Bypasses Type Safety

**Priority:** P3
**Created:** 2026-03-07
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md)
**Status:** Open

---

## Problem

The Clerk webhook verification function in `app/api/webhooks/clerk/route.ts:13-18` uses two `as unknown as` casts to bridge the type gap between the Next.js `Request` type and Clerk SDK's expected input/output types:

```typescript
async function verifyClerkWebhook(req: Request): Promise<ClerkWebhookEvent> {
  type ClerkRequestLike = Parameters<typeof verifyWebhook>[0];
  return (await verifyWebhook(
    req as unknown as ClerkRequestLike,
  )) as unknown as ClerkWebhookEvent;
}
```

**Why this is problematic:**

1. **Input cast** (`req as unknown as ClerkRequestLike`): Assumes the Next.js `Request` object is structurally compatible with Clerk's expected request type. If Clerk's SDK changes to require properties that `Request` doesn't have, the verification will fail at runtime with an unclear error.

2. **Output cast** (`as unknown as ClerkWebhookEvent`): Assumes the return value of `verifyWebhook` matches the `ClerkWebhookEvent` type defined in `clerk-webhook-controller.ts`. If the Clerk SDK's return shape diverges from our type definition, the controller will operate on incorrect data with no type error.

---

## Mitigating Factors

- The Clerk SDK's `verifyWebhook` does runtime validation (signature check, payload parsing). If the input is wrong, it throws rather than returning bad data.
- The `processClerkWebhook` controller validates the event type before processing, which provides a runtime guard on the output shape.
- This pattern is common in SDK interop where types don't align perfectly.

---

## Proposed Fix

Use Zod validation on the output to ensure type safety at runtime:

```typescript
import { z } from 'zod';

const ClerkWebhookEventSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
});

async function verifyClerkWebhook(req: Request): Promise<ClerkWebhookEvent> {
  type ClerkRequestLike = Parameters<typeof verifyWebhook>[0];
  const raw = await verifyWebhook(req as unknown as ClerkRequestLike);
  return ClerkWebhookEventSchema.parse(raw) as ClerkWebhookEvent;
}
```

The input cast is unavoidable (SDK type mismatch), but validating the output removes the second cast and provides a clear error if the SDK response shape changes.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Valid Clerk webhook | Parsed and processed normally |
| T2 | Clerk SDK returns unexpected shape | Zod parse error caught by webhook handler, returns 500 |
| T3 | Invalid signature | Clerk SDK throws, caught by webhook handler |
