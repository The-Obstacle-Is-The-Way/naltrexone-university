# BUG-023: Missing Clerk Webhook for User Deletion — Orphaned Data

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

When a user is deleted in Clerk (admin action or self-deletion), the app had no webhook endpoint to react to the deletion. This left orphaned data in Postgres and could allow Stripe subscriptions to continue billing.

## Root Cause

Only Stripe webhooks were implemented. There was no Clerk webhook route to process `user.deleted` events, and no application-side orchestration to cancel Stripe subscriptions + delete the internal user row.

## Fix

1. Added a Clerk webhook endpoint at `POST /api/webhooks/clerk`, public but signature-protected using Clerk’s `verifyWebhook`.
2. Added a `processClerkWebhook` controller that handles:
   - `user.deleted`: finds the internal user by Clerk ID, cancels Stripe subscriptions for the mapped Stripe customer (best-effort across all statuses), then deletes the user row.
   - The DB schema already cascades from `users` → `stripe_customers`, `stripe_subscriptions`, `practice_sessions`, `attempts`, and `bookmarks`, so deleting the user row cleans up related records.
3. Added `UserRepository.deleteByClerkId()` with a Drizzle implementation + tests.
4. Ensured Clerk middleware allows unauthenticated access to `/api/webhooks/clerk` so Clerk can deliver events.

## Verification

- [x] Unit tests added/updated:
  - `src/adapters/controllers/clerk-webhook-controller.test.ts`
  - `app/api/webhooks/clerk/route.test.ts`
  - `src/adapters/repositories/drizzle-user-repository.test.ts`
- [x] `pnpm test --run`

## Related

- `app/api/webhooks/clerk/route.ts`
- `src/adapters/controllers/clerk-webhook-controller.ts`
- `src/adapters/repositories/drizzle-user-repository.ts`
