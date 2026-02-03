# BUG-014: Pricing Subscribe Action Not Working (Server Action Serialization)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02

---

## Description

On `/pricing`, clicking **Subscribe Monthly** did not start the checkout flow for unauthenticated users. The click did not navigate away from `/pricing`, and Next.js logged server-side errors about:

- `searchParams` being a Promise and needing `await` / `React.use()`
- Functions being passed to Client Components / server action serialization failing

This blocked the paywall flow from the very first step.

## Steps to Reproduce

1. Navigate to `/pricing`
2. Click **Subscribe Monthly**
3. Expected: redirect to `/sign-up` (unauthenticated)
4. Actual: stayed on `/pricing` (no redirect)

## Root Cause

In production (`pnpm build && pnpm start`), submitting the subscribe form triggered:

- `Error: Failed to find Server Action "<id>"` (Next.js)

The server action reference existed in the compiled output (the client submitted an action id), but the build output did **not** include that id in `.next/server/server-reference-manifest.json`. Without a manifest mapping, Next.js cannot route the action request to the correct module, so the form submission fails and the user remains on `/pricing`.

## Fix

- Moved the subscribe server actions into a dedicated `use server` module:
  - `app/pricing/subscribe-actions.ts` exports `subscribeMonthlyAction` and `subscribeAnnualAction`
  - This ensures the actions are present in `.next/server/server-reference-manifest.json` for production/CI
- Extracted the redirect decision logic into a unit-testable helper with explicit returns:
  - `app/pricing/subscribe-action.ts` (`runSubscribeAction(...)`)

## Verification

- [x] E2E test added: `tests/e2e/pricing-unauthenticated.spec.ts`
- [x] Unit tests updated: `app/pricing/page.test.tsx`
- [x] Verified locally:
  - `pnpm test --run`
  - `pnpm build`
  - `CI=1 pnpm test:e2e` (ensures Playwright runs against `pnpm start`, same as CI)

## Related

- `app/pricing/page.tsx`
- `tests/e2e/pricing-unauthenticated.spec.ts`
