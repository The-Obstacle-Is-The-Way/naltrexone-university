# BUG-142: Container Logger Fallback to `console` Bypasses Secret Redaction

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

The composition root in `lib/container.ts` falls back to `console` when `primitives.logger` is nullish. The `console` object does not have the Pino redaction rules configured in `lib/logger.ts`, meaning any log output through the fallback could expose secrets (authorization headers, Stripe signatures, Clerk keys).

**Observed:** `createContainerPrimitives()` returns `console` as the logger when `primitives.logger` is undefined.

**Expected:** The logger should always be the structured Pino instance with redaction. If the logger is undefined, it should fail loudly rather than silently downgrading to unredacted `console`.

## Root Cause

`lib/container.ts:46-49`:
```typescript
return {
  ...primitives,
  logger: primitives.logger ?? console,
} as const;
```

## Impact Assessment

**Low likelihood.** The `primitives.logger` comes from the module-level `logger` import in `lib/container.ts:16`, which is always defined in normal operation. The fallback would only trigger if someone explicitly passes `{ logger: undefined }` in overrides (e.g., in tests).

**High severity if triggered.** Secrets would be logged without redaction.

## Fix

Remove the fallback and let TypeScript enforce that the logger is always provided:

```typescript
return {
  ...primitives,
  // logger is required — no console fallback to preserve redaction rules
} as const;
```

Or add an explicit guard:

```typescript
if (!primitives.logger) {
  throw new Error('Logger is required in container primitives');
}
```

## Verification

- [ ] Unit test: Verify container throws when logger is undefined
- [ ] Grep for any test code that relies on the console fallback and update it

## Related

- `lib/container.ts:34-50`
- `lib/logger.ts:19-42` — Pino redaction configuration
