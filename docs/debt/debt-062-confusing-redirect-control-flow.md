# DEBT-062: Confusing Redirect Control Flow Relies on redirect() Throwing

## Category: Code Clarity

## Summary
The `createSubscribeAction` function relies on the implicit behavior that `redirect()` throws an error to terminate execution. The code appears to have multiple redirect calls in sequence, but only works because redirect never returns.

## Location
- `app/pricing/page.tsx:218-225`

## Current Code
```typescript
return async function subscribe() {
  'use server';
  const result = await input.createCheckoutSessionFn({ plan: input.plan });
  if (result.ok) input.redirectFn(result.data.url);      // Throws, never returns
  if (result.error.code === 'UNAUTHENTICATED') input.redirectFn('/sign-up');  // Only runs if above didn't execute
  input.redirectFn('/pricing?checkout=error');           // Only runs if neither above executed
};
```

This works but is confusing because:
1. It looks like all three redirects could run
2. Control flow depends on knowing redirect() throws
3. No explicit `return` statements
4. If redirect() ever stops throwing, code would be buggy

## Impact
- **Code readability:** Confusing to new developers
- **Maintenance risk:** Future changes may break implicit assumption
- **Testing difficulty:** Hard to unit test control flow

## Effort: Trivial
Just needs explicit returns.

## Recommended Fix
```typescript
return async function subscribe() {
  'use server';
  const result = await input.createCheckoutSessionFn({ plan: input.plan });

  if (result.ok) {
    return input.redirectFn(result.data.url);
  }

  if (result.error.code === 'UNAUTHENTICATED') {
    return input.redirectFn('/sign-up');
  }

  return input.redirectFn('/pricing?checkout=error');
};
```

Or use if-else for complete clarity:
```typescript
if (result.ok) {
  input.redirectFn(result.data.url);
} else if (result.error.code === 'UNAUTHENTICATED') {
  input.redirectFn('/sign-up');
} else {
  input.redirectFn('/pricing?checkout=error');
}
```

## Related
- Next.js redirect() behavior: throws NEXT_REDIRECT error
