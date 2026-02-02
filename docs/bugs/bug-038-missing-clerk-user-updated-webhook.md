# BUG-038: Missing Clerk user.updated Webhook — Email Sync Gap

## Severity: P3 - Low

## Summary
When a user updates their email in Clerk (via dashboard or API), the change is not reflected in our database until the user logs in again. This can cause email mismatches between Clerk, our database, and Stripe customer records.

## Location
- **Missing endpoint:** `app/api/webhooks/clerk/` does not exist
- **User repository:** `src/adapters/repositories/drizzle-user-repository.ts`
- **Auth gateway:** `src/adapters/gateways/clerk-auth-gateway.ts:37-46`

## Current Behavior
1. User registers, email `user@old.com` stored in:
   - Clerk (source of truth)
   - `users` table
   - Stripe customer record
2. User updates email to `user@new.com` in Clerk dashboard
3. Clerk knows `user@new.com`, but:
   - `users.email` still has `user@old.com`
   - Stripe customer still has `user@old.com`
4. Only when user logs in again does `ClerkAuthGateway.getCurrentUser()` call `upsertByClerkId()` with new email

## Expected Behavior
Email changes should sync within reasonable time (minutes, not days):
1. Clerk sends `user.updated` webhook
2. Application updates `users.email`
3. Optionally update Stripe customer email

## Impact
- **Low severity:** Most users don't change emails frequently
- **Email mismatch:** Stripe receipts sent to wrong email
- **Support confusion:** Database shows different email than Clerk
- **Analytics skew:** User identified by different emails across systems

## Root Cause
No Clerk webhook integration. User sync relies entirely on upsert-on-login pattern.

## Why This Is P3 (Not Higher)
Per [Clerk documentation](https://clerk.com/docs/guides/development/webhooks/syncing):
> "Syncing Clerk user data to your database is not always necessary—and the Clerk team recommends avoiding it when possible."

The upsert-on-login pattern is Clerk-recommended for simple cases. Email sync on next login is acceptable for most applications. This is a minor data hygiene issue, not a functional bug.

## Recommended Fix (If Implementing)
```typescript
// app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix';

export async function POST(req: Request) {
  const payload = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  const event = wh.verify(payload, headers) as { type: string; data: any };

  if (event.type === 'user.updated') {
    const { id, email_addresses, primary_email_address_id } = event.data;
    const primary = email_addresses.find(e => e.id === primary_email_address_id);
    if (primary) {
      await userRepository.updateEmailByClerkId(id, primary.email_address);
    }
  }

  return new Response('OK', { status: 200 });
}
```

## Alternative: Accept As-Is
Document that email sync happens on next login. This is acceptable per Clerk best practices and avoids adding webhook infrastructure for a minor issue.

## Related
- BUG-022: Missing Clerk user.deleted webhook (higher priority)
- AUDIT-003: External integrations review
- Clerk docs: https://clerk.com/docs/guides/development/webhooks/syncing
