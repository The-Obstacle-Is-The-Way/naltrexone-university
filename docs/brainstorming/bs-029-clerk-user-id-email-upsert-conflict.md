# BS-029: Clerk User ID / Email Upsert Conflict — Unhandled Unique Constraint

**Date:** 2026-02-21
**Triggered by:** Localhost sign-in with Google OAuth crashed with `ApplicationError: CONFLICT — User could not be upserted due to a uniqueness constraint`
**Scope:** `DrizzleUserRepository.upsertByClerkId` does not handle `emailUq` constraint conflicts; only handles `clerkUserIdUq`
**Related:** [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md) (same bug on Preview, 2026-02-06), [SPEC-029](../specs/spec-029-dev-environment-resilience.md) (Dev Environment Resilience), E2E seed script (`tests/e2e/helpers/seed-test-user.ts`)

---

## The Problem

When a user signs in through a **different Clerk auth method** (e.g., Google OAuth vs email+password), Clerk may assign a **different `clerk_user_id`** to the same email address. The user upsert in `DrizzleUserRepository.upsertByClerkId` only handles conflicts on `clerkUserIdUq`, not `emailUq`. This causes a hard crash — unrecoverable `ApplicationError: CONFLICT` on every page.

### What happened (concrete scenario — 2026-02-21, localhost)

1. User originally signed in on Vercel Preview with email+password → Clerk user `user_39JTh...` → DB row: `(user_39JTh..., jj@novamindnyc.com)` written to Neon `dev` branch
2. At some point, the original Clerk user was deleted or a separate Google OAuth user was created in the same Clerk Development instance
3. User signs in on localhost via Google → Clerk returns `user_39JNW...` (different ID) with the same email `jj@novamindnyc.com`
4. `upsertByClerkId('user_39JNW...', 'jj@novamindnyc.com')` executes:
   - INSERT `(clerk_user_id=user_39JNW..., email=jj@novamindnyc.com)`
   - No conflict on `clerkUserIdUq` (new ID doesn't exist in DB) → proceeds with INSERT
   - **CONFLICT on `emailUq`** (email already belongs to the old Clerk user)
   - `onConflictDoUpdate` only targets `clerkUserIdUq` → doesn't catch this → throws unique violation (Postgres error 23505)
5. `mapDbError` catches the `23505` but returns a generic `ApplicationError('CONFLICT', 'User could not be upserted due to a uniqueness constraint')` without identifying which constraint failed
6. Every page that calls `getCurrentUser()` or `requireUser()` crashes

### Evidence

```
Clerk API: user_39JNWO0KHwz9e3IuoFtJqNa72AQ → jj@novamindnyc.com (Google OAuth)
Local DB:  user_39JThIocxTYuibCIZ4WX71CFfJT → jj@novamindnyc.com (stale)
```

The IDs differ. Same email, different Clerk identities.

### Prior occurrence: BUG-079 (2026-02-06)

**This is the second time this exact bug has been hit.** [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md) Issue 2 documents the same crash on the Preview deployment after a Neon `dev` branch was created from `main` with stale Clerk Development user data. The fix then was also manual DB surgery (wiping user tables). The root cause was identified but not fixed in code.

---

## Root Cause Analysis

### The bug: `drizzle-user-repository.ts:62-77`

```typescript
const [row] = await this.db
  .insert(users)
  .values({
    clerkUserId: clerkId,
    email,
    createdAt: observedAt,
    updatedAt: observedAt,
  })
  .onConflictDoUpdate({
    target: users.clerkUserId,  // ← only handles clerkUserId conflicts
    set: {
      email: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${email} ELSE ${users.email} END`,
      updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
    },
  })
  .returning();
```

The `users` table (`db/schema.ts:95-112`) has **two** unique constraints:
- `users_clerk_user_id_uq` on `clerk_user_id` — **handled** by `onConflictDoUpdate`
- `users_email_uq` on `email` — **NOT handled** → throws unrecoverable 23505

Postgres only allows one `ON CONFLICT` target per statement. The code chose `clerkUserId`, leaving `email` conflicts as unhandled exceptions.

### Vertical trace: every call site that invokes the buggy method

| Call Site | File:Line | Trigger | Blast Radius |
|-----------|-----------|---------|--------------|
| `ClerkAuthGateway.getCurrentUser()` | `clerk-auth-gateway.ts:70` | Every page load for signed-in user | **Every page** — marketing pages too |
| `ClerkAuthGateway.requireUser()` | `clerk-auth-gateway.ts:75` | Pages requiring auth | All `(app)` routes |
| `processClerkWebhook('user.updated')` | `clerk-webhook-controller.ts:163` | Clerk `user.updated` webhook | Webhook returns 500 |
| `ensureDbUser()` (E2E seed) | `seed-test-user.ts:92` | E2E test setup | N/A — **already fixed** |

### Horizontal trace: every entry point that calls getCurrentUser/requireUser

| Entry Point | Path | Method Called |
|-------------|------|--------------|
| App layout (every `/app/*` page) | `app/(app)/app/layout.tsx:45` | `requireUser()` |
| Billing page | `app/(app)/app/billing/page.tsx:48` | `requireUser()` |
| Checkout success sync | `app/(marketing)/checkout/success/checkout-success-sync.tsx:121` | `requireUser()` |
| Pricing page | `app/pricing/page.tsx:52` | `getCurrentUser()` |
| Get Started CTA | `components/get-started-cta.tsx:43` | `getCurrentUser()` |
| Auth nav | `components/auth-nav.tsx:57` | `getCurrentUser()` |

**Total blast radius: every single page** when a signed-in user has a stale `clerk_user_id` in the DB. The marketing pages (`/`, `/pricing`) call `getCurrentUser()` for conditional UI (showing "Dashboard" vs "Sign in"), so even non-app pages crash.

### The E2E seed script already solved this correctly

`tests/e2e/helpers/seed-test-user.ts:92-101` uses:

```sql
INSERT INTO users (clerk_user_id, email)
VALUES (${clerkUserId}, ${email})
ON CONFLICT (email) DO UPDATE
  SET clerk_user_id = EXCLUDED.clerk_user_id,
      updated_at    = now()
RETURNING id
```

The seed script conflicts on `email` and updates the `clerk_user_id`. This is the correct behavior — **email is the stable identity anchor**, and Clerk user IDs can change. If the same email comes in with a new Clerk ID, the old ID should be replaced.

### Existing tooling that could help (but isn't used)

`postgres-errors.ts:20-37` already exports `getPostgresConstraintName()` which extracts the specific constraint name from Postgres errors. The `mapDbError()` method in `drizzle-user-repository.ts:32-43` calls `isPostgresUniqueViolation()` but does NOT call `getPostgresConstraintName()` — it discards the information about which constraint failed.

### Test coverage gaps

1. **Integration test gap:** `repositories.integration.test.ts:1948-2039` tests three scenarios:
   - Basic upsert (new user)
   - Clock-guard semantics (same clerkId, stale vs fresh `observedAt`)
   - Email update (same clerkId, different email)
   - **Missing: different clerkId, same email** — the exact scenario that causes the bug

2. **FakeUserRepository gap:** `fake-user-repository.ts:9-73` indexes users by `clerkId` only (using `Map<string, StoredUser>`). It has no email lookup. Calling `upsertByClerkId('new-clerk-id', 'existing@email.com')` would silently create a duplicate email entry in the fake — no error thrown, no conflict detected. Unit tests using fakes cannot catch this bug.

3. **Unit test gap:** `drizzle-user-repository.test.ts` uses `vi.fn()` mocks for the database, so it can only test the method's logic around the mock, not actual Postgres constraint behavior.

---

## When This Bug Gets Invoked

### Scenarios that change a Clerk user ID for the same email

| Scenario | Environment | Likelihood | Recovery |
|----------|-------------|------------|----------|
| Google OAuth creates separate user from email+password (not linked in Clerk dashboard) | Dev/Preview/Prod | **High** in dev, Medium in prod | Manual DB `UPDATE` |
| Clerk user deleted + new user created with same email | Dev (users freely deleted) | **High** in dev | Manual DB `UPDATE` |
| Neon branch creation inherits stale Clerk IDs | Dev (branch from main) | **High** | Manual DB cleanup |
| Clerk support merges two users | Prod | Low | Handled by `user.updated` webhook — **but webhook also has this bug** |
| Clerk environment reset | Dev/Staging | Medium | Manual DB cleanup |
| Multiple auth strategies (Apple + Google + email) for same email | Prod | Low-Medium | Manual DB `UPDATE` |

### Why localhost and Preview share this risk

Both localhost and Vercel Preview deployments use the **same Clerk Development instance** and the **same Neon `dev` branch** (`deployment-environments.md`). The Clerk `pk_test_*` key is the same. The DATABASE_URL is the same. So:

1. User signs in on Preview → Clerk user ID `A` written to Neon `dev`
2. Clerk user `A` gets deleted/changed
3. User signs in on localhost → Clerk user ID `B` for same email → **CRASH**

This is why BUG-079 (Preview, 2026-02-06) and BS-029 (localhost, 2026-02-21) are the same underlying bug — same database, same Clerk instance, different moments when the Clerk user ID diverged from what the DB had.

### Why Production is also at risk

The `user.updated` webhook controller (`clerk-webhook-controller.ts:163`) calls the same buggy `upsertByClerkId`. If a Clerk user merge or strategy change fires a `user.updated` event with a new `clerk_user_id` for an existing email, the webhook will fail with a 500 error. Clerk retries failed webhooks, but they'll keep failing because the bug is deterministic.

In Production, this could happen if:
- A user adds Google OAuth to their existing email+password account (if Clerk creates a new user ID during linking)
- An admin merges two Clerk accounts via the Clerk dashboard
- A user deletes their account and re-registers with the same email

---

## Severity Assessment

| Aspect | Rating |
|--------|--------|
| **Priority** | **P1 — Significant** |
| **Blast radius** | Every page (marketing + app) — complete app lockout for affected user |
| **Frequency** | 2nd occurrence in 15 days (BUG-079 on 2026-02-06, BS-029 on 2026-02-21) |
| **Production risk** | Medium — Clerk user merges, strategy changes, or `user.updated` webhooks could trigger this |
| **Recovery** | Manual DB surgery: `UPDATE users SET clerk_user_id = '...' WHERE email = '...'` — no self-service path |
| **Webhook risk** | Clerk `user.updated` webhook uses same buggy path — would return 500 and retry indefinitely |
| **Test coverage** | None — no integration test, fake doesn't model email uniqueness, unit test mocks DB |

---

## Proposed Fix (Sketch)

### Fix C (Recommended): Catch-and-update on email conflict

Keep the existing `onConflictDoUpdate` on `clerkUserId` (handles the common path) and add a catch handler for the `emailUq` constraint:

```typescript
async upsertByClerkId(
  clerkId: string,
  email: string,
  options?: UpsertUserByClerkIdOptions,
): Promise<User> {
  const observedAt = options?.observedAt ?? this.now();
  const observedAtParam = sql.param(observedAt, users.updatedAt);

  try {
    const [row] = await this.db
      .insert(users)
      .values({
        clerkUserId: clerkId,
        email,
        createdAt: observedAt,
        updatedAt: observedAt,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          email: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${email} ELSE ${users.email} END`,
          updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
        },
      })
      .returning();

    if (!row) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
    }
    return this.toDomain(row);
  } catch (error) {
    // Handle email uniqueness conflict: same email, different clerkUserId
    // This happens when Clerk reassigns a user ID (merge, recreation, strategy change)
    if (
      isPostgresUniqueViolation(error) &&
      getPostgresConstraintName(error) === 'users_email_uq'
    ) {
      const [row] = await this.db
        .update(users)
        .set({
          clerkUserId: clerkId,
          updatedAt: observedAt,
        })
        .where(eq(users.email, email))
        .returning();

      if (!row) {
        throw new ApplicationError('INTERNAL_ERROR', 'Failed to update user clerkUserId by email');
      }
      return this.toDomain(row);
    }

    throw this.mapDbError(error);
  }
}
```

**Why Fix C over Fix B (switching to `ON CONFLICT (email)`):**

Fix B (matching the seed script's `ON CONFLICT (email)`) would lose the existing `observedAt` clock-guard logic that prevents stale webhook data from overwriting fresh sign-in data. The current `CASE WHEN ... THEN ... ELSE ...` guard on `updatedAt` is an important race-condition protection (see debt-084). Fix C preserves this while adding email conflict handling.

Fix C also aligns with how Postgres works — `getPostgresConstraintName()` already exists in the codebase (`postgres-errors.ts:20-37`) and returns the exact constraint name, making the catch handler precise.

### Required test additions

1. **Integration test:** Add to `repositories.integration.test.ts`:
   ```typescript
   it('updates clerkUserId when a different clerkId arrives for the same email', async () => {
     const repo = new DrizzleUserRepository(db);
     const email = `it-${randomUUID()}@example.com`;
     const clerkId1 = `user_${randomUUID().replaceAll('-', '')}`;
     const clerkId2 = `user_${randomUUID().replaceAll('-', '')}`;

     const first = await repo.upsertByClerkId(clerkId1, email);
     cleanup.userIds.push(first.id);

     // Same email, different clerk ID — should update, not crash
     const second = await repo.upsertByClerkId(clerkId2, email);
     expect(second.id).toBe(first.id);  // Same DB user
     expect(second.email).toBe(email);

     // Old clerk ID should no longer find the user
     await expect(repo.findByClerkId(clerkId1)).resolves.toBeNull();
     // New clerk ID should find the user
     await expect(repo.findByClerkId(clerkId2)).resolves.toMatchObject({ id: first.id });
   });
   ```

2. **FakeUserRepository:** Add email-based lookup:
   ```typescript
   // Add a secondary index by email
   private readonly byEmail = new Map<string, string>(); // email → clerkId

   async upsertByClerkId(clerkId, email, options?) {
     // Check if email already exists under a different clerkId
     const existingClerkId = this.byEmail.get(email);
     if (existingClerkId && existingClerkId !== clerkId) {
       // Migrate: remove old clerkId entry, update with new clerkId
       const existing = this.byClerkId.get(existingClerkId)!;
       this.byClerkId.delete(existingClerkId);
       this.byClerkId.set(clerkId, { user: existing.user, clerkId });
       this.byEmail.set(email, clerkId);
       return existing.user;
     }
     // ... existing logic ...
   }
   ```

3. **Unit test for FakeUserRepository:** Add "different clerkId, same email" scenario to `fakes.test.ts`.

### Additional fixes (non-blocking)

1. **Better error message in `mapDbError`:** Use `getPostgresConstraintName()` to include which constraint failed:
   ```typescript
   if (isPostgresUniqueViolation(error)) {
     const constraint = getPostgresConstraintName(error);
     return new ApplicationError(
       'CONFLICT',
       `User could not be upserted: uniqueness constraint "${constraint}" violated`,
     );
   }
   ```

2. **Dev mode error page:** Show actual `ApplicationError` code and message on `error.tsx` when `process.env.NODE_ENV === 'development'`.

3. **Expired Stripe API key:** `.env.local` has an expired `STRIPE_SECRET_KEY`. This is a separate issue but was discovered during this investigation.

4. **Price ID fallback for dev:** `DrizzleSubscriptionRepository.toDomain` throws if price_id is unknown. In dev mode, unknown price IDs should map to a fallback plan rather than crashing.

---

## Open Questions

1. **Should the `user.updated` webhook proactively handle Clerk ID changes?** Currently the webhook calls `upsertByClerkId` which has the same bug. If we fix `upsertByClerkId` (Fix C), the webhook automatically benefits. But should we also explicitly handle `user.merged` events?

2. **Should the `UserRepository` port interface document the email conflict contract?** The current JSDoc on `upsertByClerkId` says "Upsert a user by their Clerk ID" and mentions race conditions, but doesn't mention what happens when a different clerkId arrives for an existing email.

3. **Should we add a health check or self-healing mechanism?** Instead of requiring manual DB surgery, could we add a CLI command or admin endpoint that resolves stale clerk_user_id rows by querying the Clerk API?

4. **Is `user.merged` a real Clerk event?** Need to verify if Clerk actually fires `user.merged` or if merges result in `user.updated` + `user.deleted` for the merged-away user.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-06 | BUG-079: Fixed by manual DB wipe of user tables on Neon `dev` branch | Same root cause. Root cause identified but not fixed in code. |
| 2026-02-21 | Created brainstorming doc (BS-029) | Second occurrence in 15 days. Localhost sign-in with Google OAuth crashed due to Clerk user ID mismatch. Same email, different clerk_user_id. Upsert only handles clerkUserIdUq conflict, not emailUq. |
| 2026-02-21 | Immediate fix: manual DB UPDATE | Updated `clerk_user_id` in local DB to match current Clerk user. Seeded subscription with real price_id. Localhost functional. |
| 2026-02-21 | Noted: E2E seed script already has the correct pattern | `seed-test-user.ts` uses `ON CONFLICT (email) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id` — the production repository should follow this pattern. |
| 2026-02-21 | Noted: two additional crashes during investigation | (1) Expired Stripe API key prevents programmatic subscription seeding. (2) Unknown price_id in DB causes domain-layer crash in `toDomain`. Both are dev environment resilience issues. |
| 2026-02-21 | Recommended Fix C (catch-and-update) over Fix B (switch target) | Fix C preserves the existing `observedAt` clock-guard logic that protects against stale webhook data races (debt-084). Fix B would lose this protection. |
| 2026-02-21 | Deep investigation: traced all call sites and entry points | 3 call sites invoke `upsertByClerkId` (auth gateway, webhook controller, E2E seed). 6 entry points in app/components call getCurrentUser/requireUser. Blast radius is every page, not just `(app)` routes. |
| 2026-02-21 | Identified: no test coverage at any level | No integration test for "different clerkId, same email". FakeUserRepository silently allows duplicate emails. Unit tests mock the DB. |
