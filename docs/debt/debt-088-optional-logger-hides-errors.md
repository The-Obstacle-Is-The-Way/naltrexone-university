# DEBT-088: Optional Logger Pattern Hides Errors

**Status:** Open
**Priority:** P2
**Date:** 2026-02-03

---

## Description

Multiple locations use optional chaining on the logger (`logger?.warn`, `logger?.error`), which means if the logger isn't configured, warnings and errors are silently discarded.

```typescript
// Pattern seen throughout codebase
d.logger?.warn('Something bad happened', { context });  // ← Silently does nothing if logger undefined
```

## Affected Locations

| File | Lines | Context |
|------|-------|---------|
| `bookmark-controller.ts` | 126 | Orphaned bookmarks |
| `review-controller.ts` | 98 | Orphaned missed questions |
| `stats-controller.ts` | 143 | Orphaned recent activity |
| `clerk-webhook-controller.ts` | 134 | Webhook processing issues |
| `stripe-payment-gateway.ts` | 206, 354 | Stripe API issues |

## Why This Is a Problem

1. **Silent Failures:** In production, if logger isn't properly wired, errors vanish.

2. **Inconsistent Debugging:** Works in dev (console configured), breaks in prod (structured logger missing).

3. **Violates Fail-Fast:** We should know immediately if logging infrastructure is broken.

## How It Happens

The logger is injected via dependency injection:

```typescript
// Controller deps type
type BookmarkControllerDeps = {
  // ...
  logger?: Logger;  // ← Optional
};

// Container provides it... or not
createBookmarkControllerDeps: () => ({
  // ...
  logger: primitives.logger,  // ← Could be undefined
}),
```

## Resolution Options

### Option A: Make Logger Required with Console Fallback (Recommended)

```typescript
// lib/container.ts
const primitives = {
  logger: createStructuredLogger() ?? console,  // Always defined
};

// Controller deps type
type BookmarkControllerDeps = {
  logger: Logger;  // ← Required, not optional
};
```

Then remove all optional chaining:
```typescript
d.logger.warn('Something bad happened', { context });  // ← Always works
```

**Pros:** Guaranteed visibility, explicit contract
**Cons:** Requires updating all dep types

### Option B: Create No-Op Logger

```typescript
// lib/logger.ts
const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Usage
const logger = deps.logger ?? noopLogger;
logger.warn(...);  // Always safe to call
```

**Pros:** No changes to optional types
**Cons:** Still silently drops logs if misconfigured

### Option C: Assert Logger Exists

```typescript
function requireLogger(logger: Logger | undefined): Logger {
  if (!logger) {
    throw new Error('Logger is required but was not injected');
  }
  return logger;
}

// In controller
const logger = requireLogger(d.logger);
logger.warn(...);
```

**Pros:** Fail-fast on misconfiguration
**Cons:** App crashes if logger missing

## Recommendation

**Option A (Required with Fallback):**

1. Make `logger` required in all dep types
2. Provide `console` as fallback in container
3. Remove all `?.` optional chaining on logger calls

This ensures:
- Every log statement executes
- At minimum, logs go to console
- No silent failures

## Implementation Steps

1. Update `lib/container.ts`:
   ```typescript
   logger: createStructuredLogger() ?? console,
   ```

2. Update all `*ControllerDeps` types to make `logger` required

3. Search and replace `d.logger?.` with `d.logger.`

4. Run tests to verify nothing breaks

## Verification

- [ ] Grep finds no `logger?.` patterns in controllers
- [ ] All controller tests pass
- [ ] Logs appear in both dev and prod environments

## Related

- `lib/container.ts` — Dependency injection
- All controller files in `src/adapters/controllers/`
- `src/adapters/gateways/stripe-payment-gateway.ts`
