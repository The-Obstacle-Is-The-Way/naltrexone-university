# DEBT-180: Duplicated Manage-Billing Files Across Pricing and Billing Routes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

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

1. Create a shared module at `lib/manage-billing/` (or `app/shared/`) containing:
   - `manage-billing-types.ts` — the shared types (single source)
   - `manage-billing-core.ts` — shared orchestration logic accepting an error-routing config parameter
2. Reduce each route's `manage-billing-action.ts` to a thin wrapper that calls the shared core with route-specific error redirect targets.
3. Delete duplicated types and actions files from both routes.
4. Update imports in both routes and their tests.

## Verification

- [ ] Only one `manage-billing-types.ts` exists (shared location)
- [ ] Both routes still function correctly (pricing portal redirect, billing portal redirect)
- [ ] Tests cover both error-routing paths
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/pricing/manage-billing-action.ts`
- `app/pricing/manage-billing-actions.ts`
- `app/pricing/manage-billing-types.ts`
- `app/(app)/app/billing/manage-billing-action.ts`
- `app/(app)/app/billing/manage-billing-actions.ts`
- `app/(app)/app/billing/manage-billing-types.ts`
- Frontend tracker: FE-040
