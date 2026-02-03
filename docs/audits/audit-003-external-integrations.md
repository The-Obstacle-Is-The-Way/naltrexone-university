# AUDIT-003: External Integrations Review

**Date:** 2026-02-02
**Auditor:** Claude (Adversarial Review)
**Scope:** Verification of external integration patterns against industry best practices

---

## Summary

This audit reviews all external integrations in the codebase against documented best practices from official sources and industry experts. The goal is to verify whether the codebase is "hand-rolling" unnecessary complexity or following recommended patterns.

## Sources Consulted

1. **Clerk Documentation** - https://clerk.com/docs/guides/development/webhooks/syncing
2. **Theo Browne's stripe-recommendations** - https://github.com/t3dotgg/stripe-recommendations (6.2k stars)
3. **Pedro Alonso's Stripe Webhook Series** - https://www.pedroalonso.net/blog/stripe-webhooks-deep-dive/
4. **paykit-cli** - https://github.com/argcast/paykit

---

## 1. CLERK INTEGRATION

### Current Implementation

| Component | Location | Pattern Used |
|-----------|----------|--------------|
| SDK | `@clerk/nextjs v6.37.1` | Official SDK |
| Middleware | `proxy.ts:1-25` | `clerkMiddleware()` with route matcher |
| Auth Gateway | `src/adapters/gateways/clerk-auth-gateway.ts` | Adapter pattern with DI |
| User Sync | `ClerkAuthGateway.getCurrentUser()` | Upsert-on-login |

### Best Practices Verification

**CLAIM: "Clerk recommends webhooks for user sync"**
- **VERIFIED PARTIALLY TRUE** - Clerk docs say syncing is "not always necessary" and recommends avoiding it when possible. Webhook sync is recommended ONLY when you need to:
  - Query user data in ways that exceed rate limits
  - Build analytics/reporting systems
  - Comply with audit logging requirements
  - Integrate with external systems

**CLAIM: "Session tokens can avoid database sync"**
- **VERIFIED TRUE** - Clerk docs confirm session tokens with custom claims provide strong consistency without database sync. Limited to 1.2KB of custom data.

**CLAIM: "Svix provides automatic retries"**
- **VERIFIED TRUE** - Clerk uses Svix under the hood with exponential backoff retry logic.

### Assessment: MOSTLY CORRECT

The codebase uses **upsert-on-login** pattern (line 46 of clerk-auth-gateway.ts), which is a valid Clerk-recommended approach for simple cases. This avoids:
- Webhook infrastructure complexity
- Eventual consistency issues
- Additional failure points

**HOWEVER**, this required follow-up work. These items are now resolved (see archived bug docs):

| Item | Status | Reference |
|------|--------|-----------|
| `user.deleted` webhook | Resolved | [BUG-023](../_archive/bugs/bug-023-missing-clerk-user-deletion-webhook.md) |
| `user.updated` webhook | Resolved | [BUG-038](../_archive/bugs/bug-038-missing-clerk-user-updated-webhook.md) |

### Recommendation

The upsert-on-login pattern is CORRECT for this use case. Do NOT add unnecessary webhook complexity for user sync. However, DO add webhooks for:
- `user.deleted` - Required for data hygiene and GDPR
- `user.updated` - Optional but recommended for email sync

---

## 2. STRIPE INTEGRATION

### Current Implementation

| Component | Location | Pattern Used |
|-----------|----------|--------------|
| SDK | `stripe v20.3.0` | Official SDK |
| Initialization | `lib/stripe.ts:1-8` | Server-only singleton |
| Payment Gateway | `src/adapters/gateways/stripe-payment-gateway.ts` | Adapter pattern with DI |
| Webhook Controller | `src/adapters/controllers/stripe-webhook-controller.ts` | Transaction + claim/lock |
| Checkout Success | `app/(marketing)/checkout/success/page.tsx` | **Eager sync pattern** |

### Best Practices Verification

**CLAIM: "Theo Browne's syncStripeDataToKV pattern is industry standard"**
- **VERIFIED TRUE** - His repo has 6.2k stars and is MIT licensed. Key recommendations:
  1. Single sync function for all Stripe data
  2. Call it eagerly after checkout (not just webhooks)
  3. Store only needed data, not full Stripe objects

**CLAIM: "Webhook events have race conditions"**
- **VERIFIED TRUE** - Stripe sends 258+ event types, order is not guaranteed, duplicate delivery happens.

**CLAIM: "paykit-cli provides scaffolding"**
- **VERIFIED TRUE** - Exists at https://github.com/argcast/paykit. Provides idempotency, Clerk integration, webhook dedup.

### Assessment: MOSTLY CORRECT

**POSITIVE FINDINGS:**

1. **Eager Sync Implemented** - `syncCheckoutSuccess()` in checkout success page (lines 92-151) fetches from Stripe API and upserts to database BEFORE redirecting to dashboard. This prevents the "user arrives before webhook" race condition.

2. **Idempotency Pattern** - Webhook controller uses claim + lock pattern via `stripe_events` table:
   ```typescript
   await stripeEvents.claim(event.eventId, event.type);
   const current = await stripeEvents.lock(event.eventId);
   if (current.processedAt !== null && current.error === null) return;
   ```

3. **Transaction Isolation** - Subscription updates wrapped in database transaction.

4. **Signature Verification** - Webhooks verified via `constructEvent()`.

**FOLLOW-UP ITEMS (updated):**

| Item | Status | Reference |
|------|--------|-----------|
| Renewals/payment-failure race window | Accepted (won’t fix) | [BUG-024](../_archive/bugs/bug-024-entitlement-race-condition-past-due.md) |
| `paused`/`resumed` handlers | Resolved | [BUG-025](../_archive/bugs/bug-025-missing-subscription-event-handlers.md) |
| `stripe_events` retention/pruning | Resolved | [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) |
| Preserve webhook error context | Resolved | [BUG-034](../_archive/bugs/bug-034-webhook-error-context-lost.md) |

### Recommendation

The implementation follows Theo's patterns for new checkouts. Consider:
1. Adding a `syncSubscriptionState()` function for real-time checks on sensitive operations
2. Adding TTL cleanup for `stripe_events` table
3. Preserving original error context in webhook handler

---

## 3. DATABASE (NEON PostgreSQL)

### Current Implementation

| Component | Location | Pattern Used |
|-----------|----------|--------------|
| Client | `postgres v3.4.8` | postgres-js driver |
| ORM | `drizzle-orm v0.45.1` | Type-safe query builder |
| Connection | `lib/db.ts:1-19` | Singleton with global cache |
| Repositories | `src/adapters/repositories/*.ts` | Repository pattern with DI |

### Assessment: CORRECT

Standard Drizzle + postgres-js setup. No unusual patterns or anti-patterns detected.

---

## 4. OTHER INTEGRATIONS

| Package | Purpose | Status |
|---------|---------|--------|
| `pino` | Logging | Standard usage |
| `zod` | Validation | Standard usage |
| `swr` | Client data fetching | Standard usage |
| `react-markdown` | Content rendering | Standard usage |
| `rehype-sanitize` | HTML sanitization | Standard usage |

No issues found with other integrations.

---

## OVERALL VERDICT

### Is the Codebase "Hand-Rolling" Unnecessarily?

**NO** - The core patterns are correct and align with industry best practices:

1. **Clerk**: Uses upsert-on-login (Clerk-recommended for simple cases)
2. **Stripe**: Implements eager sync + idempotent webhooks (Theo-recommended)
3. **Database**: Standard Drizzle repository pattern

### Should We Adopt paykit-cli?

**NOT RECOMMENDED** - The codebase already implements the same patterns paykit provides:
- Idempotency via `stripe_events` table
- Eager sync on checkout success
- Transaction isolation

Adopting paykit would require significant refactoring with minimal benefit.

### Remaining Work

1. **Clerk user webhooks** (`user.deleted`, `user.updated`) — resolved (see BUG-023 / BUG-038)
2. **Stripe event retention** (`stripe_events` pruning) — resolved (see BUG-027)
3. **Webhook error context preservation** — resolved (see BUG-034)
4. **Subscription state handlers** (`paused`, `resumed`) — resolved (see BUG-025)

---

## Related Documentation

- [BUG-023](../_archive/bugs/bug-023-missing-clerk-user-deletion-webhook.md): Clerk `user.deleted` webhook
- [BUG-038](../_archive/bugs/bug-038-missing-clerk-user-updated-webhook.md): Clerk `user.updated` webhook
- [BUG-024](../_archive/bugs/bug-024-entitlement-race-condition-past-due.md): Entitlement race window (accepted)
- [BUG-025](../_archive/bugs/bug-025-missing-subscription-event-handlers.md): Subscription paused/resumed handlers
- [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md): Stripe events retention/pruning
- [BUG-034](../_archive/bugs/bug-034-webhook-error-context-lost.md): Webhook error context preservation
- DEBT-069: Document Stripe eager sync pattern

## Sources

- [Clerk Webhooks Documentation](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Theo Browne's stripe-recommendations](https://github.com/t3dotgg/stripe-recommendations)
- [Pedro Alonso's Stripe Webhook Series](https://www.pedroalonso.net/blog/stripe-webhooks-deep-dive/)
- [paykit-cli GitHub](https://github.com/argcast/paykit)
