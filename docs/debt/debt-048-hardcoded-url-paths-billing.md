# DEBT-048: Hard-Coded URL Paths in Billing Controller

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The billing controller has three URL paths hard-coded as string literals instead of centralized constants. If these routes are renamed, the billing controller must be manually updated — easy to miss.

**Locations:**
- `/checkout/success` (line 44)
- `/pricing` (line 49)
- `/app/billing` (line 55)

## Impact

- Route renames require manual updates in multiple files
- No compile-time checking — broken URLs only discovered at runtime
- Inconsistent pattern — some controllers use constants, this one doesn't
- Silent failures if URLs diverge from actual routes

## Resolution

1. Create a centralized routes constant file:
```typescript
// lib/routes.ts
export const ROUTES = {
  CHECKOUT_SUCCESS: '/checkout/success',
  PRICING: '/pricing',
  APP_BILLING: '/app/billing',
  // ... other routes
} as const;
```

2. Import and use in billing-controller.ts:
```typescript
import { ROUTES } from '@/lib/routes';

function toSuccessUrl(appUrl: string): string {
  const base = new URL(ROUTES.CHECKOUT_SUCCESS, appUrl);
  return `${base.toString()}?session_id={CHECKOUT_SESSION_ID}`;
}
```

3. Update all other files that reference these routes

## Verification

- [ ] Routes constant file created
- [ ] Billing controller updated to use constants
- [ ] Other files updated to use same constants
- [ ] TypeScript catches any mistyped route references

## Related

- `src/adapters/controllers/billing-controller.ts:44-55`
- Similar pattern needed for other hard-coded routes in codebase
