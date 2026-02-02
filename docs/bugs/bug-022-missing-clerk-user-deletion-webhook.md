# BUG-022: Missing Clerk Webhook for User Deletion

## Severity: P2 - Medium

## Summary
When a user is deleted in Clerk (admin action or user self-deletion), there is no webhook endpoint to clean up the corresponding database records. This leaves orphaned user data in the database.

## Location
- **Missing endpoint:** `app/api/webhooks/clerk/` does not exist
- **Existing Stripe webhook:** `app/api/stripe/webhook/` exists but no Clerk equivalent

## Current Behavior
1. User exists in Clerk and database
2. User is deleted in Clerk dashboard or via Clerk API
3. Database records persist indefinitely:
   - `users` table row remains
   - `stripe_subscriptions` linked to that user remain
   - `attempts`, `bookmarks`, `practice_sessions` all remain orphaned
4. Stripe subscription may continue billing a deleted user

## Expected Behavior
1. Clerk sends `user.deleted` webhook event
2. Application receives and processes the event
3. Database cascades or cleans up related records
4. Stripe subscription is cancelled if active

## Impact
- **Data integrity:** Orphaned records accumulate over time
- **GDPR compliance risk:** User data retained after deletion request
- **Billing issues:** Stripe may continue to bill deleted users
- **Storage waste:** Dead records consume database space

## Root Cause
No Clerk webhook integration was implemented. Only Stripe webhooks exist.

## Recommended Fix
1. Create `app/api/webhooks/clerk/route.ts`
2. Verify webhook signature using Clerk SDK
3. Handle `user.deleted` event type
4. Delete or soft-delete user and cascade to related tables
5. Cancel any active Stripe subscription for the user

## Related
- Clerk docs: https://clerk.com/docs/integrations/webhooks
- SPEC-007: User-facing API (should include deletion handling)
