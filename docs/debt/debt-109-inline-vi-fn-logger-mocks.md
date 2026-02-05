# DEBT-109: Inline vi.fn() Logger Mocks Violate Fakes-Over-Mocks Rule

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05

---

## Description

DEBT-051 resolved inline `vi.fn()` usage in controller tests, but the same anti-pattern survived in gateway and infrastructure tests. Five test files still create inline logger objects instead of using the canonical `FakeLogger` from `src/application/test-helpers/fakes.ts`.

The highest-impact offender is `stripe-payment-gateway.test.ts`, which defines its own `class FakeLogger` with `vi.fn()` methods and uses `toHaveBeenCalledWith()` assertions — directly violating CLAUDE.md's "FAKES OVER MOCKS" rule.

## Affected Files

### HIGH — Inline class with vi.fn(), assertions coupled to mock API

| File | Pattern | Assertions to Rewrite |
|------|---------|----------------------|
| `src/adapters/gateways/stripe-payment-gateway.test.ts` (lines 5-10) | `class FakeLogger { readonly debug = vi.fn(); ... }` | 8 `toHaveBeenCalledWith()` calls |

### MEDIUM — vi.spyOn on real singleton

| File | Pattern | Assertions to Rewrite |
|------|---------|----------------------|
| `src/adapters/controllers/action-result.test.ts` (lines 69-70, 85-86) | `vi.spyOn(logger, 'error')` on `@/lib/logger` singleton | 2 `toHaveBeenCalledWith()` calls |

### LOW — Inline no-op stubs (no assertions on calls)

| File | Pattern | Impact |
|------|---------|--------|
| `lib/container.test.ts` (lines 69-71, 118-120) | `{ error: () => undefined } as unknown as Logger` | No assertions — injection only |
| `lib/container.skip-clerk.test.ts` (lines 51-53, 100-102) | Same inline stub | No assertions — injection only |
| `src/adapters/controllers/tag-controller.test.ts` (lines 59-64) | `{ debug: () => {}, info: () => {}, ... }` | No assertions — injection only |

## Root Cause

DEBT-051 scoped its fix to controller tests (`src/adapters/controllers/*.test.ts`). Gateway tests and infrastructure tests were not audited, so the inline pattern persisted.

## Why This Matters

The canonical `FakeLogger` in `fakes.ts` uses call-tracking arrays (`.errorCalls`, `.warnCalls`, etc.), while the inline version uses `vi.fn()`. This creates two problems:

1. **API inconsistency** — Some tests assert with `.errorCalls.toContainEqual(...)`, others with `.toHaveBeenCalledWith(...)`. Future agents copy whichever pattern they find first.
2. **Drift risk** — If the `Logger` port interface changes, the canonical `FakeLogger` breaks at compile time. The inline classes silently diverge.

## Resolution

### Step 1: Refactor stripe-payment-gateway.test.ts (HIGH)

Replace the inline class:

```typescript
// Before (lines 5-10):
class FakeLogger {
  readonly debug = vi.fn();
  readonly info = vi.fn();
  readonly error = vi.fn();
  readonly warn = vi.fn();
}

// After:
import { FakeLogger } from '@/src/application/test-helpers/fakes';
```

Rewrite 8 assertions:

```typescript
// Before:
expect(logger.error).toHaveBeenCalledWith(
  { operation: 'createCheckoutSession' },
  'Failed to create checkout session',
);

// After:
expect(logger.errorCalls).toContainEqual({
  context: { operation: 'createCheckoutSession' },
  msg: 'Failed to create checkout session',
});
```

### Step 2: Refactor action-result.test.ts (MEDIUM)

Replace `vi.spyOn(logger, 'error')` with injected `FakeLogger`. This may require making the `withActionErrorHandling` function accept a logger parameter.

### Step 3: Replace no-op stubs (LOW)

Replace inline stubs in `container.test.ts`, `container.skip-clerk.test.ts`, and `tag-controller.test.ts` with `new FakeLogger()`.

## Verification

1. All 779+ tests pass after refactor
2. `grep -rn "vi.fn()" --include="*.test.ts" --include="*.test.tsx" | grep -i logger` returns zero results
3. No test file defines its own `FakeLogger` class
4. All logger assertions use `.errorCalls` / `.warnCalls` / `.infoCalls` / `.debugCalls` array pattern

## Related

- [DEBT-051](../_archive/debt/debt-051-controller-tests-use-mocks-not-fakes.md) (Resolved) — Same pattern, fixed in controller tests only
- CLAUDE.md "FAKES OVER MOCKS" section — The rule being violated
- `src/application/test-helpers/fakes.ts` — Canonical FakeLogger (lines 74-95)
