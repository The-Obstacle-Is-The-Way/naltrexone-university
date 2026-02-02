# DEBT-039: Error Context Loss in Stripe Webhook Failures

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-02

---

## Description

The Stripe webhook controller uses `toErrorMessage()` to convert errors before storing them:

```typescript
// src/adapters/controllers/stripe-webhook-controller.ts:26-29
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
```

When `stripeEvents.markFailed()` is called (line 68), only the message string is passed:

```typescript
await stripeEvents.markFailed(event.eventId, toErrorMessage(error));
```

This loses important error context:
- Stack trace
- Error type/class
- Nested error details
- Any custom properties on the error object

## Impact

- **Difficult debugging:** Production webhook failures become hard to diagnose
- **Lost context:** Error type, stack trace, and custom properties are discarded
- **Observability gap:** Monitoring and alerting systems can't distinguish error types

## Location

- `src/adapters/controllers/stripe-webhook-controller.ts:26-29, 68`

## Resolution

Consider storing more structured error data:

```typescript
function toErrorData(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 1000), // Truncate for storage
      ...(error instanceof ApplicationError && { code: error.code }),
    });
  }
  return JSON.stringify({ message: 'Unknown error', raw: String(error) });
}
```

The schema's `error` column is already `text` type, so it can accommodate JSON.

### Stored error format

`stripe_events.error` stores a JSON string with these fields (when available):

- `name`: string
- `message`: string
- `stack`: string (truncated)
- `code`: application error code (only for `ApplicationError`)
- `fieldErrors`: record of field errors (only for `ApplicationError`)
- `raw`: string (only for non-`Error` values)

## Verification

- [x] Update `toErrorMessage()` to capture structured error data
- [x] Verify JSON fits within any column size limits
- [x] Add test case for structured error storage
- [x] Document error format for future debugging

## Related

- `src/adapters/repositories/drizzle-stripe-event-repository.ts` - Where errors are stored
- SPEC-016 (Observability) - Related to error tracking improvements
