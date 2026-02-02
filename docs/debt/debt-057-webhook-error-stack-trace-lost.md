# DEBT-057: Webhook Error Stack Trace Lost in Database

**Status:** Open
**Priority:** P3
**Date:** 2026-02-02

---

## Description

When a Stripe webhook fails, only the error message is saved to the database — the stack trace is lost. This makes debugging webhook failures harder.

**Location:** `src/adapters/controllers/stripe-webhook-controller.ts:26-28`

```typescript
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
```

**Current behavior:**
- `stripeEvents.error` column gets: `"Cannot read property 'id' of undefined"`

**Better behavior:**
- `stripeEvents.error` column gets: `"Cannot read property 'id' of undefined\n    at processSubscription (stripe-webhook-controller.ts:85)\n    at ..."`

## Impact

- Debugging webhook failures requires reproducing the error
- No visibility into where in the code the error occurred
- Non-Error objects (e.g., Zod validation errors) lose all detail
- Production debugging is harder

## Resolution

1. Capture full error details:
```typescript
function toErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}`;
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
```

2. Consider structured error storage:
```typescript
// Instead of text column, use JSONB
error: jsonb('error').$type<{
  name: string;
  message: string;
  stack?: string;
  details?: unknown;
}>()
```

## Verification

- [ ] Stack trace preserved in error column
- [ ] Non-Error objects serialized with detail
- [ ] Existing error queries still work
- [ ] Manual test: trigger webhook error, verify full stack in DB

## Related

- `src/adapters/controllers/stripe-webhook-controller.ts:26-28`
- `db/schema.ts` — stripeEvents.error column
- DEBT-039: Error Context Loss in Stripe Webhook Failures (related)
