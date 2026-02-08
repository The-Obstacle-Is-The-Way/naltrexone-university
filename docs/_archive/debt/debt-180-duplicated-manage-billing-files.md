# DEBT-180: Duplicated Manage-Billing Files Across Pricing and Billing Routes

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

The manage-billing infrastructure is duplicated across two route groups:

| File in `app/pricing/` | File in `app/(app)/app/billing/` |
|---|---|
| `manage-billing-action.ts` | `manage-billing-action.ts` |
| `manage-billing-actions.ts` | `manage-billing-actions.ts` |
| `manage-billing-types.ts` | `manage-billing-types.ts` |
| `manage-billing-action.test.ts` | `manage-billing-action.test.ts` |
| `manage-billing-actions.test.ts` | `manage-billing-actions.test.ts` |

- `manage-billing-types.ts` files are **byte-for-byte identical**.
- `manage-billing-actions.ts` files are structurally identical except for import paths.
- `manage-billing-action.ts` files differ only in error handling (pricing redirects to `/sign-up` for unauthenticated and `/pricing?checkout=error` for failures; billing redirects to `/app/billing?error=portal_failed`).

## Impact

- Changes to the billing portal flow must be made in two places.
- Types will drift over time.
- Test files are nearly duplicated.

## Resolution

1. Created a shared manage-billing module in `lib/manage-billing/`:
   - `manage-billing-types.ts` (single source of truth for action types)
   - `manage-billing-core.ts` (shared orchestration and error-route mapping)
2. Converted both route actions to thin wrappers:
   - `app/pricing/manage-billing-action.ts`
   - `app/(app)/app/billing/manage-billing-action.ts`
3. Removed duplicated route-local types files and updated route action modules to import shared types.
4. Added dedicated shared-core tests in `lib/manage-billing/manage-billing-core.test.ts` and verified existing route tests still pass.

## Verification

- [x] Only one `manage-billing-types.ts` exists (shared location)
- [x] Both routes still function correctly (pricing portal redirect, billing portal redirect)
- [x] Tests cover both error-routing paths
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/pricing/manage-billing-action.ts`
- `app/pricing/manage-billing-actions.ts`
- `app/pricing/manage-billing-types.ts`
- `app/(app)/app/billing/manage-billing-action.ts`
- `app/(app)/app/billing/manage-billing-actions.ts`
- `app/(app)/app/billing/manage-billing-types.ts`
- Frontend tracker: FE-040
