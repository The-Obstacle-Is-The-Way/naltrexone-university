# DEBT-085: Union Return Type Pattern in requireEntitledUserId()

**Status:** Open
**Priority:** P3
**Date:** 2026-02-03

---

## Description

The `requireEntitledUserId()` function returns `Promise<string | ActionResult<never>>`, forcing all callers to perform runtime type checks:

```typescript
// require-entitled-user-id.ts:13
export async function requireEntitledUserId(deps: {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
}): Promise<string | ActionResult<never>> {
  // ...
  return user.id;  // or err('UNSUBSCRIBED', ...)
}

// All 10 call sites must check:
const userIdOrError = await requireEntitledUserId(d);
if (typeof userIdOrError !== 'string') return userIdOrError;
const userId = userIdOrError;  // Now safe to use
```

## Affected Locations

All 10 controllers use this pattern:

| File | Line |
|------|------|
| `question-view-controller.ts` | 67 |
| `review-controller.ts` | 70 |
| `question-controller.ts` | 119, 150 |
| `stats-controller.ts` | 96 |
| `tag-controller.ts` | 57 |
| `practice-controller.ts` | 109, 181 |
| `bookmark-controller.ts` | 74, 111 |

## Why This Is a Code Smell

1. **Liskov Substitution Violation:** The function doesn't truly substitute for `Promise<string>`. Callers can't treat it as a simple async function.

2. **Inconsistent API:** Most functions throw errors on failure (standard pattern), but this returns them. Mixed conventions increase cognitive load.

3. **Brittle Type Check:** `typeof userIdOrError !== 'string'` relies on knowing the internal structure. If the success type changes, all call sites break.

4. **Verbose Call Sites:** Every caller needs 2-3 lines of boilerplate instead of 1.

## Why It Exists

The pattern was likely chosen to:
- Avoid throwing errors in server actions (Next.js serialization concerns)
- Return structured error responses to the client
- Keep the control flow explicit

## Resolution Options

### Option A: Throw and Let Controllers Handle (Recommended)

Change `requireEntitledUserId()` to throw on failure:

```typescript
export async function requireEntitledUserId(deps: {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
}): Promise<string> {
  const user = await deps.authGateway.requireUser();
  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    throw new ApplicationError('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}
```

The existing `try/catch` blocks in controllers already handle errors via `handleError()`.

**Pros:** Clean API, standard error handling, simpler call sites
**Cons:** Requires updating all 10 call sites (but they get simpler)

### Option B: Use Proper Result Type

Create a discriminated union type:

```typescript
type EntitlementResult =
  | { ok: true; userId: string }
  | { ok: false; error: ActionResult<never> };

export async function requireEntitledUserId(deps): Promise<EntitlementResult> {
  // ...
  return { ok: true, userId: user.id };
  // or
  return { ok: false, error: err('UNSUBSCRIBED', ...) };
}

// Caller:
const result = await requireEntitledUserId(d);
if (!result.ok) return result.error;
const userId = result.userId;
```

**Pros:** Explicit, type-safe, no runtime type checking
**Cons:** Still verbose, custom pattern

### Option C: Accept Current Pattern (Document It)

Keep as-is but add JSDoc explaining the pattern:

```typescript
/**
 * Returns the entitled user's ID or an error result.
 *
 * ⚠️ Usage pattern - callers must check the return type:
 * ```
 * const userIdOrError = await requireEntitledUserId(deps);
 * if (typeof userIdOrError !== 'string') return userIdOrError;
 * // userIdOrError is now narrowed to string
 * ```
 */
export async function requireEntitledUserId(...): Promise<string | ActionResult<never>>
```

**Pros:** No code changes
**Cons:** Keeps the code smell

## Recommendation

**Option A (Throw)** is the Clean Code approach:
- Follows standard async function conventions
- Leverages existing error handling infrastructure
- Simplifies call sites

The concern about "returning errors to avoid throwing" is unnecessary — the controllers already have `try/catch` blocks that call `handleError()`.

## Verification

After refactoring:
- [ ] TypeScript compiles
- [ ] All controller tests pass
- [ ] Error responses unchanged (same HTTP status codes, messages)

## Related

- `src/adapters/controllers/require-entitled-user-id.ts` — The function
- `src/adapters/controllers/action-result.ts` — ActionResult type
- `src/adapters/controllers/handle-error.ts` — Error handler
