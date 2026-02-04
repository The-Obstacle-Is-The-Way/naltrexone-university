# DEBT-094: Inline Server Action Inside Billing Page (Inconsistent Pattern)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-04
**Resolved:** 2026-02-04

---

## Description

`app/(app)/app/billing/page.tsx` defines an inline server action (`manageBilling`) inside the page component. Most other mutations use extracted server action files or controller exports, so this breaks the prevailing pattern and adds another reason for the page to change.

Evidence:

- `app/(app)/app/billing/page.tsx:167-174` defines:
  - `async function manageBilling() { 'use server'; ... }`
  - redirects based on controller result

## Impact

- **Inconsistent structure:** server actions are not uniformly organized.
- **Harder to reuse:** action logic can’t be imported elsewhere.
- **Testing ergonomics:** inline action can’t be unit-tested independently (server component constraints).

## Resolution

1. Extract the server action to a dedicated module, e.g.:
   - `app/(app)/app/billing/actions.ts` (export `manageBillingAction`)
2. Keep `page.tsx` responsible for:
   - loading data
   - rendering the view
   - referencing the extracted action
3. (Optional) Add a small unit test for the extracted action’s control flow using injected redirect function patterns, if the codebase supports it.

## Verification

- No inline `'use server'` functions remain in `page.tsx`.
- Billing page tests still pass.

## Related

- `app/(app)/app/billing/page.tsx`
- `src/adapters/controllers/billing-controller.ts`
