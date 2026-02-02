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

`app/pricing/page.tsx` built server actions via `createSubscribeAction(...)` that **closed over function values** (e.g., `createCheckoutSessionFn`, `redirectFn`). Next.js server actions must be serializable for progressive enhancement and cannot capture non-serializable values like functions.

Additionally, the page accessed `searchParams.checkout` synchronously, which Next.js flagged as a sync dynamic API usage.

## Fix

- Refactored the subscribe logic into a testable helper `runSubscribeAction(...)` and changed `createSubscribeAction(plan)` to only close over the serializable `plan` value.
- Updated `PricingPage` to accept `searchParams` as a Promise and `await` it before reading.
- Added a Playwright test to ensure the unauthenticated subscribe action redirects to `/sign-up`.

## Verification

- [x] E2E test added: `tests/e2e/pricing-unauthenticated.spec.ts`
- [x] Unit tests updated: `app/pricing/page.test.tsx`
- [x] Verified locally:
  - `pnpm test --run`
  - `pnpm test:e2e`

## Related

- `app/pricing/page.tsx`
- `tests/e2e/pricing-unauthenticated.spec.ts`

