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

**HOWEVER**, there are gaps:

| Issue | Impact | Bug/Debt ID |
|-------|--------|-------------|
| No `user.deleted` webhook | Orphaned data, GDPR risk | BUG-023 |
| No `user.updated` webhook | Email out of sync | BUG-038 |

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

**REMAINING GAPS:**

| Issue | Impact | Bug/Debt ID |
|-------|--------|-------------|
| No eager sync for subscription updates | Race on payment failures | BUG-024 (partial) |
| Missing `paused`/`resumed` handlers | State machine incomplete | BUG-025 |
| No cleanup on `stripe_events` | Unbounded table growth | BUG-027 |
| Webhook error context lost | Hard to debug | BUG-034 |

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

1. **Add Clerk webhooks** for `user.deleted` and optionally `user.updated`
2. **Add `stripe_events` cleanup** (TTL or periodic job)
3. **Preserve webhook error context** for debugging
4. **Add missing Stripe event handlers** (`paused`, `resumed`)

---

## Related Documentation

- BUG-023: Missing Clerk user.deleted webhook
- BUG-038: Missing Clerk user.updated webhook
- BUG-024: Entitlement race condition (webhook delay)
- BUG-025: Missing subscription event handlers
- BUG-027: Stripe events unbounded growth
- BUG-034: Webhook error context lost
- DEBT-069: Document Stripe eager sync pattern

## Sources

- [Clerk Webhooks Documentation](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Theo Browne's stripe-recommendations](https://github.com/t3dotgg/stripe-recommendations)
- [Pedro Alonso's Stripe Webhook Series](https://www.pedroalonso.net/blog/stripe-webhooks-deep-dive/)
- [paykit-cli GitHub](https://github.com/argcast/paykit)
