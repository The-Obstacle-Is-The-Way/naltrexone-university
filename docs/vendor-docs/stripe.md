# Stripe Vendor Documentation

**Package:** `stripe` ^20.3.0
**API Version:** `2026-01-28.clover`
**Dashboard:** https://dashboard.stripe.com
**Docs:** https://docs.stripe.com
**Changelog:** https://docs.stripe.com/changelog

---

## API Version History

| Date | API Version | Impact | Notes |
|------|-------------|--------|-------|
| 2026-01-28 | `2026-01-28.clover` | Current | Our pinned version |
| 2025-03-31 | `2025-03-31.basil` | **BREAKING** | `current_period_end` moved to items |

**How to check current version:**
```bash
stripe config --list  # Shows API version in use
```

---

## Fields We Depend On

### Subscription Object

| Field | Location | Used In | Notes |
|-------|----------|---------|-------|
| `id` | `subscription.id` | Webhook handler | Subscription ID |
| `customer` | `subscription.customer` | Webhook handler | Customer ID |
| `status` | `subscription.status` | Webhook, billing page | `active`, `past_due`, etc. |
| `current_period_end` | **`subscription.items.data[0].current_period_end`** | Webhook, checkout success | **MOVED in 2025-03-31** |
| `cancel_at_period_end` | `subscription.cancel_at_period_end` | Billing page | Boolean |
| `items.data[].price.id` | `subscription.items.data[0].price.id` | Webhook handler | Price ID for plan |
| `metadata.user_id` | `subscription.metadata.user_id` | Webhook handler | Our internal user ID |

### Checkout Session Object

| Field | Location | Used In | Notes |
|-------|----------|---------|-------|
| `id` | `session.id` | Checkout success | Session ID |
| `url` | `session.url` | Subscribe action | Redirect URL |
| `subscription` | `session.subscription` | Checkout success | Expanded subscription |
| `line_items` | `session.line_items` | Session reuse check | Needs `expand` |

---

## Breaking Changes We've Hit

### BUG-045: `current_period_end` Moved to Items (2025-03-31)

**What broke:** Checkout success page and webhooks read `subscription.current_period_end`, which returns `null` on API >= `2025-03-31`.

**Stripe changelog:** https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end

**Fix:**
```typescript
// OLD (broken)
subscription.current_period_end  // null

// NEW (correct)
subscription.items.data[0].current_period_end  // number
```

**Affected files:**
- `app/(marketing)/checkout/success/page.tsx`
- `src/adapters/gateways/stripe-payment-gateway.ts`

**Detection:** Would have caught this if we searched changelog for "current_period" before upgrading.

---

## Webhooks We Handle

| Event | Handler | Purpose |
|-------|---------|---------|
| `customer.subscription.created` | `processWebhookEvent` | New subscription (may lack metadata) |
| `customer.subscription.updated` | `processWebhookEvent` | Status changes, renewals |
| `customer.subscription.deleted` | `processWebhookEvent` | Cancellation |
| `customer.subscription.paused` | `processWebhookEvent` | Pause (if enabled) |
| `customer.subscription.resumed` | `processWebhookEvent` | Resume from pause |
| `customer.subscription.pending_update_applied` | `processWebhookEvent` | Scheduled change applied |
| `customer.subscription.pending_update_expired` | `processWebhookEvent` | Scheduled change expired |

**Webhook endpoint:** `/api/webhooks/stripe`

**Webhook secret:** `STRIPE_WEBHOOK_SECRET` env var

---

## Test Mode vs Live Mode

| Environment | API Key Prefix | Webhook Secret |
|-------------|---------------|----------------|
| Development | `sk_test_` | `whsec_` (test) |
| Production | `sk_live_` | `whsec_` (live) |

**CLI for local testing:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Upgrade Checklist

When upgrading Stripe SDK or API version:

- [ ] Read [changelog](https://docs.stripe.com/changelog) for breaking changes
- [ ] Search codebase for deprecated fields: `current_period_start`, `current_period_end` at subscription level
- [ ] Update `StripeSubscriptionLike` type in `stripe-payment-gateway.ts`
- [ ] Run `pnpm test --run` — webhook tests should catch field changes
- [ ] Test checkout flow end-to-end locally
- [ ] Test webhook delivery with `stripe listen`
- [ ] Update this doc with new version and any migrations

---

## Sources

- [Stripe API Versioning](https://docs.stripe.com/api/versioning)
- [Stripe Changelog](https://docs.stripe.com/changelog)
- [Stripe API Upgrades](https://docs.stripe.com/upgrades)
- [stripe-node GitHub](https://github.com/stripe/stripe-node)
