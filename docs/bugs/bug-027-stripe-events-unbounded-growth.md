# BUG-027: Stripe Events Table Unbounded Growth

## Severity: P2 - Medium

## Summary
The `stripe_events` table stores every webhook event indefinitely with no retention policy. Over time, this table will grow unbounded, causing storage costs and query performance degradation.

## Location
- `db/schema.ts:161-173`

## Current Schema
```typescript
export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    type: varchar('type', { length: 255 }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    typeIdx: index('stripe_events_type_idx').on(t.type),
    processedAtIdx: index('stripe_events_processed_at_idx').on(t.processedAt),
  }),
);
```

No `createdAt`, `deletedAt`, or TTL mechanism exists.

## Impact
- **Storage costs:** 1 event per Stripe interaction accumulates
- **Query performance:** Index bloat over time
- **Backup size:** Larger backups with historical data
- **Compliance:** Old event data may need retention limits

## Projection
Assuming 100 active subscribers with monthly billing:
- ~100 webhook events/month minimum (subscription.updated on each renewal)
- + Payment events, customer events, etc.
- After 1 year: ~1,200+ events minimum
- After 5 years: ~6,000+ events

With 10,000 subscribers: 120,000+ events/year

## Recommended Fix
**Option A:** Add retention policy with scheduled cleanup:
```sql
-- Add createdAt for retention tracking
ALTER TABLE stripe_events ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();

-- Scheduled job: DELETE FROM stripe_events WHERE created_at < NOW() - INTERVAL '90 days';
```

**Option B:** Soft delete with archival:
```typescript
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

**Option C:** Move to separate events/audit table with partitioning.

## Related
- SPEC-009: Stripe Integration
- DEBT-039: Webhook error context loss
