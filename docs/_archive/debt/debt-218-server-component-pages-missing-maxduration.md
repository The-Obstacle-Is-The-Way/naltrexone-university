# DEBT-218: Server Component Pages Missing maxDuration + Dead Code in practice-logic.ts

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-15
**Resolved:** 2026-02-15
**GitHub Issue:** —

---

## Summary

This debt item captured two risks raised during the SPEC-029 audit:

1. Ensure key Server Component pages and API routes have explicit `maxDuration` caps on Vercel.
2. Remove dead, test-only async exports from `app/(app)/app/practice/practice-logic.ts`.

## Resolution

### 1) `maxDuration` coverage

Verified the following Server Component pages already export `maxDuration = 30`:

- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/history/page.tsx`
- `app/(app)/app/bookmarks/page.tsx`
- `app/(app)/app/billing/page.tsx`
- `app/(app)/app/questions/[slug]/page.tsx`

API routes export the SPEC-029 values:

- `app/api/health/route.ts` (`10`)
- `app/api/stripe/webhook/route.ts` (`30`)
- `app/api/webhooks/clerk/route.ts` (`30`)
- `app/api/cron/reconcile-stripe-subscriptions/route.ts` (`60`)

### 2) Dead exports removed from `practice-logic.ts`

Removed unused async exports from `app/(app)/app/practice/practice-logic.ts` that had no production callers and were only referenced by `practice-logic.test.ts`. The module now contains only shared error helpers:

- `getActionResultErrorMessage()`
- `getThrownErrorMessage()` (including friendly mapping for `TimeoutError`)

Associated unit tests were updated to cover only the remaining exports.

## Notes

- `withTimeout` is a client-side safeguard for hung server actions; server-side execution limits should use `maxDuration`.
- Canonical question/submit flows live in `app/(app)/app/practice/shared/question-flow-actions.ts`.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build`

## Related

- [SPEC-029](../../specs/spec-029-dev-environment-resilience.md)
- [BS-017](../../brainstorming/bs-017-dev-environment-resilience.md)
