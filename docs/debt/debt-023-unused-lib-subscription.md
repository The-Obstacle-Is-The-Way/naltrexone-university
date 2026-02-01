# DEBT-023: `lib/subscription.ts` Is Unused and Duplicates Application Entitlement Logic

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

`lib/subscription.ts` implements subscription entitlement checks by querying Drizzle directly and duplicating parts of the entitlement rule. It is currently unused by production code (only referenced in its own unit tests).

In parallel, the application layer already has:
- `src/domain/services/entitlement.ts` (`isEntitled(subscription, now)`)
- `src/application/use-cases/check-entitlement.ts` (`CheckEntitlementUseCase`)

This is a “halfway” implementation: the code exists and is tested, but no real entry point uses it, and it bypasses the application layer patterns we’ve established.

## Evidence

Repo-wide search finds no production usage:
- `isUserEntitled`, `getUserSubscription`, `requireSubscriptionOrThrow` are only referenced in `lib/subscription.test.ts`.

## Locations

- `lib/subscription.ts`
- `src/application/use-cases/check-entitlement.ts`
- `src/domain/services/entitlement.ts`

## Why This Matters

- Dead code increases maintenance cost and confuses new contributors (“which entitlement check is canonical?”).
- Duplicated logic makes future changes risky (two implementations to keep in sync).
- Clean Architecture intent is weakened if outer `lib/` utilities bypass use cases/repositories.

## Proposed Fix

Pick one strategy and delete the other:

### Option A (Prefer): remove `lib/subscription.ts`

- Enforce entitlement via a server component layout or controller that uses `CheckEntitlementUseCase`.
- Keep entitlement rules in domain + application layers only.

### Option B: keep `lib/subscription.ts`, but make it the canonical entry point

- Wire it into the actual enforcement boundary (e.g., `app/(app)/app/layout.tsx` or middleware once SLICE-1 is implemented).
- Make it a thin wrapper that delegates to repositories + domain service, not its own “shadow” logic.

Resolved via Option A:

- Deleted unused `lib/subscription.ts` and its unit tests.

## Acceptance Criteria

- No unused entitlement modules remain.
- Exactly one canonical path exists for entitlement checks.
- Consumers (layout/controllers/middleware) use the chosen path consistently.
