# DEBT-084: User Email Race Condition in Concurrent Webhook Handling

**Status:** Accepted
**Priority:** P3
**Date:** 2026-02-03
**Accepted:** 2026-02-03

---

## Description

The `DrizzleUserRepository.upsertByClerkId()` method handles concurrent inserts via `onConflictDoNothing`, but the subsequent email update logic has a theoretical race condition where concurrent requests could overwrite each other's email updates with stale data.

## Location

**File:** `src/adapters/repositories/drizzle-user-repository.ts`
**Lines:** 102-134

```typescript
// Race condition: another request inserted the row
const after = await this.db.query.users.findFirst({
  where: eq(users.clerkUserId, clerkId),
});

if (!after) {
  throw new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
}

// Check if email needs updating
if (after.email === email) {
  return this.toDomain(after);
}

// Update email after race condition
// PROBLEM: Another request might have updated the email between
// our findFirst and this update, causing us to overwrite with stale data
const [updated] = await this.db
  .update(users)
  .set({ email, updatedAt: this.now() })
  .where(eq(users.clerkUserId, clerkId))
  .returning();
```

## The Race Condition

**Scenario:** Two concurrent Clerk webhooks for the same user with different emails.

```
Timeline:
─────────────────────────────────────────────────────────────────
Request A (email: old@example.com)    Request B (email: new@example.com)
─────────────────────────────────────────────────────────────────
1. INSERT ... ON CONFLICT DO NOTHING
   → Returns nothing (conflict)
                                      2. INSERT ... ON CONFLICT DO NOTHING
                                         → Succeeds, inserts new@example.com
3. SELECT ... findFirst
   → Gets email: new@example.com
                                      4. Returns { email: new@example.com }
5. email !== "old@example.com"
   → Proceeds to update
6. UPDATE ... SET email = old@example.com
   → OVERWRITES new@example.com with stale data!
─────────────────────────────────────────────────────────────────
Result: User has old@example.com, but new@example.com was correct
```

## Impact Assessment

**Theoretical severity:** P2 (data inconsistency)
**Practical severity:** P3-P4 (very unlikely)

**Why this is low-priority:**

1. **Clerk webhook ordering:** Clerk generally delivers webhooks in order. Two simultaneous `user.updated` events for the same user with different emails is extremely rare.

2. **Email changes are rare:** Users don't change emails frequently. The window for this race is very small.

3. **Self-correcting:** The next Clerk webhook for this user will fix the email.

4. **No security impact:** Email is used for display/notifications, not authentication (Clerk handles auth).

5. **No data loss:** The user record exists; only the email field is potentially stale.

## Resolution Options

### Option A: Accept Last-Write-Wins (Current Behavior)

Document the current behavior as intentional "last write wins" and accept that in the rare case of concurrent updates, the last one to complete will persist.

**Pros:** No code change, simple mental model
**Cons:** Theoretically incorrect data possible

### Option B: Optimistic Concurrency Control

Add a `version` column and use it for conflict detection:

```typescript
// Schema change
version: integer('version').notNull().default(0),

// Repository change
const [updated] = await this.db
  .update(users)
  .set({
    email,
    updatedAt: this.now(),
    version: sql`${users.version} + 1`
  })
  .where(and(
    eq(users.clerkUserId, clerkId),
    eq(users.version, after.version)  // Only update if version matches
  ))
  .returning();

if (!updated) {
  // Version changed — retry or return the latest
  return this.upsertByClerkId(clerkId, email);  // Recursive retry
}
```

**Pros:** Correct behavior, no stale overwrites
**Cons:** Schema migration, more complex code, recursive retry needed

### Option C: Use Advisory Lock

Postgres advisory locks to serialize operations per user:

```typescript
// Serialize all operations for this clerkId
await this.db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${clerkId}))`);
// ... rest of upsert logic
```

**Pros:** Strong serialization guarantee
**Cons:** Lock contention, complexity, potential deadlocks

### Option D: Timestamp-Based Conflict Resolution

Only update if our data is newer:

```typescript
// Clerk webhook includes event timestamp
const [updated] = await this.db
  .update(users)
  .set({ email, updatedAt: eventTimestamp })
  .where(and(
    eq(users.clerkUserId, clerkId),
    lt(users.updatedAt, eventTimestamp)  // Only if our event is newer
  ))
  .returning();
```

**Pros:** Correct ordering based on actual event time
**Cons:** Requires Clerk webhook timestamp to be passed through

## Recommendation

**Option A (Accept current behavior)** for now:

1. The race condition is extremely unlikely in practice
2. The impact is minimal (email display only)
3. It's self-correcting on next webhook
4. Adding complexity for a theoretical edge case violates YAGNI

**Future consideration:** If we ever see evidence of this in production (user complaints about wrong email), implement Option D with Clerk event timestamps.

## Verification

N/A (accepted). If we implement Option D later:
- [ ] Unit test: Concurrent upserts don't overwrite newer data
- [ ] Integration test: Two simultaneous webhooks resolve correctly
- [ ] Load test: No deadlocks under concurrent webhook load

## Related

- `src/adapters/repositories/drizzle-user-repository.ts` — Implementation
- `src/adapters/controllers/clerk-webhook-controller.ts` — Webhook handler that calls upsert
- `docs/_archive/debt/debt-042-stripe-customer-concurrent-upsert.md` — Similar pattern in Stripe customer repo
