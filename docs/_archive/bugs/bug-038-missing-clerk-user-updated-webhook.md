# BUG-038: Missing Clerk user.updated Webhook — Email Sync Gap

**Status:** Resolved
**Priority:** P3 - Low
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

When a user updated their email in Clerk, the change did not sync to our database until the user logged in again (upsert-on-login). This could cause email mismatches between Clerk, our `users` table, and downstream systems like Stripe receipts.

## Root Cause

No Clerk webhook integration existed, so the only sync path was the auth gateway running during login.

## Fix

Implemented Clerk webhook handling for `user.updated`:

1. Added `POST /api/webhooks/clerk` (signature verified via Clerk `verifyWebhook`).
2. Added `processClerkWebhook` handling for `user.updated`:
   - Extracts the primary email (supports both snake_case and camelCase payload shapes).
   - Calls `UserRepository.upsertByClerkId()` to update `users.email` (idempotent).

## Verification

- [x] Unit tests added:
  - `src/adapters/controllers/clerk-webhook-controller.test.ts`
  - `app/api/webhooks/clerk/route.test.ts`
- [x] `pnpm test --run`

## Related

- `app/api/webhooks/clerk/route.ts`
- `src/adapters/controllers/clerk-webhook-controller.ts`
