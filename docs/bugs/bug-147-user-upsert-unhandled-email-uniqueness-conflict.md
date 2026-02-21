# BUG-147: User Upsert Fails on Email Uniqueness Conflict When Clerk User ID Changes

**Status:** Open
**Priority:** P1
**Date:** 2026-02-21

---

## Description

`DrizzleUserRepository.upsertByClerkId()` currently handles conflict resolution only on `users.clerk_user_id`. When a sign-in or webhook arrives with a **new Clerk user ID** for an email that already exists in the `users` table, Postgres raises `23505` on `users_email_uq`, and the request fails.

**Observed**
- `ApplicationError('CONFLICT', 'User could not be upserted due to a uniqueness constraint')` is thrown from `DrizzleUserRepository.mapDbError()`.
- User-facing routes that call `getCurrentUser()`/`requireUser()` fail for the affected user.
- Clerk `user.updated` webhook processing fails with HTTP 500 for the same condition.

**Expected**
- If the incoming email already exists with a different `clerk_user_id`, the existing `users` row should be updated to the new Clerk user ID (with timestamp ordering preserved), then returned.

## Priority Justification (P1)

- Blast radius is broad: authenticated app routes and multiple marketing-path entry points are affected for the impacted user.
- Frequency is no longer theoretical: same root cause occurred at least twice in 15 days (BUG-079 on 2026-02-06 and recurrence on 2026-02-21).
- Production risk is real: webhook path shares the same failure mode and returns 500 on affected payloads.

## Investigation Verification (BS-029)

| Item | Result | Evidence |
|------|--------|----------|
| 1. Buggy method uses `onConflictDoUpdate({ target: users.clerkUserId })` only | Confirmed | `src/adapters/repositories/drizzle-user-repository.ts:70` |
| 2. `users` has two unique constraints (`clerkUserIdUq`, `emailUq`) | Confirmed | `db/schema.ts:109`, `db/schema.ts:110` |
| 3. `getPostgresConstraintName()` exists but is not used in user repo `mapDbError()` | Confirmed | `src/adapters/repositories/postgres-errors.ts:20`, `src/adapters/repositories/drizzle-user-repository.ts:32` |
| 4. All call sites invoking `upsertByClerkId` | Partially inaccurate in BS-029 | Direct runtime invocations are `src/adapters/gateways/clerk-auth-gateway.ts:70` and `src/adapters/controllers/clerk-webhook-controller.ts:163`. E2E seed does **not** call repository method; it uses raw SQL in `tests/e2e/helpers/seed-test-user.ts:92`. |
| 5. Entry points in `app/` + `components/` for `getCurrentUser`/`requireUser` | Confirmed (6 runtime entry points) | `app/(app)/app/layout.tsx:45`, `app/(app)/app/billing/page.tsx:48`, `app/(marketing)/checkout/success/checkout-success-sync.tsx:121`, `app/pricing/page.tsx:52`, `components/get-started-cta.tsx:43`, `components/auth-nav.tsx:57` |
| 6. Webhook path uses same buggy upsert | Confirmed | `src/adapters/controllers/clerk-webhook-controller.ts:163` |
| 7. E2E seed script handles this correctly | Confirmed | `tests/e2e/helpers/seed-test-user.ts:95` uses `ON CONFLICT (email) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id` |
| 8. `FakeUserRepository` only indexes by Clerk ID, allowing duplicate emails | Confirmed | `src/application/test-helpers/fakes/fake-user-repository.ts:10`, `src/application/test-helpers/fakes/fake-user-repository.ts:66` |
| 9. Integration tests missing “different clerkId, same email” case | Confirmed | `tests/integration/repositories.integration.test.ts:1948` (existing cases do not cover this) |
| 10. BUG-079 Issue 2 is same bug and fixed by data cleanup, not code | Confirmed | `docs/_archive/bugs/bug-079-preview-dev-environment-verification-failures.md:62` and `docs/_archive/bugs/bug-079-preview-dev-environment-verification-failures.md:74` |
| 11. Localhost + Preview share Clerk Dev + Neon `dev` branch | Confirmed | `docs/dev/deployment-environments.md:46`, `docs/dev/deployment-environments.md:48`, `docs/dev/deployment-environments.md:50`, `docs/dev/deployment-environments.md:188`, `docs/dev/deployment-environments.md:189` |

## Steps to Reproduce

1. Localhost (`localhost:3000`)
1. Ensure `users` contains `{ clerk_user_id = A, email = E }` in Neon `dev`.
1. In Clerk Development, authenticate as the same email `E` but with Clerk user ID `B` (`B != A`) (for example, after deleting/recreating the Clerk user or via a separate auth-strategy identity).
1. Load a page that calls auth gateway user resolution (`/`, `/pricing`, or any `/app/*` route).
1. Observe auth path failure with `CONFLICT` and no self-heal of `users.clerk_user_id`.

1. Preview (`*.vercel.app`, non-main branch)
1. Use the same Clerk Development + Neon `dev` data condition as above.
1. Sign in on Preview with Clerk ID `B` for email `E`.
1. Observe same `CONFLICT` failure.

1. Production (`addictionboards.com`) scenario
1. Existing production row: `{ clerk_user_id = A, email = E }`.
1. Clerk Production emits a different user ID `B` for that same email `E` (for example, account recreation; merge/link flows that produce a new user ID).
1. User signs in or Clerk sends `user.updated` for user `B`.
1. Observe same uniqueness conflict path; route auth fails and webhook can return 500.

## Root Cause

`upsertByClerkId()` performs:

```ts
INSERT ... ON CONFLICT (clerk_user_id) DO UPDATE ...
```

When `clerk_user_id` is new but `email` already exists:

1. Insert does not hit `clerk_user_id` conflict target.
1. Insert violates `users_email_uq`.
1. Postgres throws unique violation (`23505`, constraint `users_email_uq`).
1. Catch block maps all unique violations to generic `ApplicationError('CONFLICT', ...)` via `mapDbError()`.
1. No email-conflict recovery path updates `clerk_user_id` by email.

Relevant code path:
- Upsert statement: `src/adapters/repositories/drizzle-user-repository.ts:62`
- Conflict target limited to clerk id: `src/adapters/repositories/drizzle-user-repository.ts:71`
- Generic unique-violation mapping: `src/adapters/repositories/drizzle-user-repository.ts:35`
- Constraint utility available but unused here: `src/adapters/repositories/postgres-errors.ts:20`

## Production Risk Assessment

1. Can this happen in production?
- Yes. The bug is environment-agnostic; it triggers whenever the same email is observed with a different Clerk user ID than what is stored.
- Concrete reproducible scenario: delete Clerk user `A`, recreate user for same email `E` as user `B`.
- Other possible trigger classes: Clerk-side merges/linking flows that yield a new canonical user ID for an existing email.

1. Does webhook path also crash?
- Yes. `processClerkWebhook('user.updated')` calls the same repository method (`src/adapters/controllers/clerk-webhook-controller.ts:163`).
- The route handler returns HTTP 500 for non-validation errors (`app/api/webhooks/clerk/handler.ts:124`).
- Clerk/Svix retries failed deliveries; without a code fix this remains deterministic failure for that payload.

1. Blast radius for stale `clerk_user_id`
- `/app/*` gated flows: `requireUser()` in app layout and billing.
- Marketing and hybrid flows: `getCurrentUser()`/`requireUser()` in home, pricing, auth nav, get-started CTA, checkout success sync.
- Practical impact: a single affected account can hit failures on both marketing and app routes.

1. Self-healing/recovery path?
- No in-app self-healing exists today.
- Webhook uses the same failing path.
- Current effective remediation is manual DB correction (`UPDATE users SET clerk_user_id = ... WHERE email = ...`) or destructive table cleanup.

1. Stripe/subscription cascading impact
- Immediate conflict does not create a second `users` row (email uniqueness blocks insert), so subscriptions are not duplicated by this path.
- Existing Stripe rows remain attached to the original `users.id` (`db/schema.ts:121`, `db/schema.ts:142`) but the user cannot authenticate into that row.
- Additional risk: if stale Clerk ID later receives `user.deleted`, controller can cancel subscriptions and delete the user row (`src/adapters/controllers/clerk-webhook-controller.ts:180`, `src/adapters/controllers/clerk-webhook-controller.ts:193`), which can cascade into data loss of active subscription mapping.

## Proposed Fix (Fix C from BS-029)

Add targeted catch-and-update handling for `users_email_uq` inside `upsertByClerkId()`, using `getPostgresConstraintName()`, while preserving DEBT-084 timestamp ordering semantics.

Proposed code change in `src/adapters/repositories/drizzle-user-repository.ts`:

```diff
@@
-import { isPostgresUniqueViolation } from './postgres-errors';
+import {
+  getPostgresConstraintName,
+  isPostgresUniqueViolation,
+} from './postgres-errors';
@@
   async upsertByClerkId(
@@
     try {
       const [row] = await this.db
@@
       return this.toDomain(row);
     } catch (error) {
+      if (
+        isPostgresUniqueViolation(error) &&
+        getPostgresConstraintName(error) === 'users_email_uq'
+      ) {
+        const [row] = await this.db
+          .update(users)
+          .set({
+            clerkUserId: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${clerkId} ELSE ${users.clerkUserId} END`,
+            updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
+          })
+          .where(eq(users.email, email))
+          .returning();
+
+        if (!row) {
+          throw new ApplicationError(
+            'INTERNAL_ERROR',
+            'Failed to ensure user row',
+          );
+        }
+
+        return this.toDomain(row);
+      }
+
       throw this.mapDbError(error);
     }
   }
```

Why this fix:
- Handles the unaddressed `users_email_uq` path directly.
- Preserves existing `clerk_user_id` upsert behavior and DEBT-084 ordering guarantees (`observedAt` clock guard).
- Uses already-available Postgres constraint introspection utility instead of broad unique-violation handling.

## Required Test Additions

1. Integration: add `DrizzleUserRepository` test for “different `clerkId`, same email” that verifies row identity is preserved and lookup migrates to new Clerk ID.
1. Fake parity: update `FakeUserRepository` to enforce email uniqueness semantics and Clerk-ID migration behavior.
1. Unit: add repository test for `users_email_uq` conflict path (constraint-aware fallback update branch), plus fake tests for same-email/new-clerk-id behavior.

## Verification Checklist

- [ ] New integration test fails before fix and passes after fix.
- [ ] New unit tests for repository email-conflict branch pass.
- [ ] `FakeUserRepository` behavior matches production uniqueness semantics.
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test --run`
- [ ] `pnpm test:integration`
- [ ] Manual verification on localhost and Preview with a forced stale `clerk_user_id` scenario.

## Related

- [BS-029 brainstorming doc](../brainstorming/bs-029-clerk-user-id-email-upsert-conflict.md)
- [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md)
- [Deployment environments SSOT](../dev/deployment-environments.md)
- [DEBT-084](../_archive/debt/debt-084-user-email-race-condition.md)
- `src/adapters/repositories/drizzle-user-repository.ts`
- `src/adapters/controllers/clerk-webhook-controller.ts`
- `tests/e2e/helpers/seed-test-user.ts`
