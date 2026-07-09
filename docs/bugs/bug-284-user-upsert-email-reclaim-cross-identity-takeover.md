# BUG-284: User Upsert Email-Conflict Fallback Treats Email as Identity — Cross-Identity Row Takeover and Sign-In Lockout

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** User provisioning / identity

---

## Summary

The `users_email_uq` fallback in [`DrizzleUserRepository.upsertByClerkId`](../../src/adapters/repositories/drizzle-user-repository.ts#L106-L131) — shipped as the [BUG-147](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) fix — runs `UPDATE users SET clerk_user_id = <incoming> WHERE email = <incoming>` ([L114](../../src/adapters/repositories/drizzle-user-repository.ts#L114), [L117](../../src/adapters/repositories/drizzle-user-repository.ts#L117)), assuming an email conflict always means the same human re-appeared under a new Clerk ID. When the email was instead freed in Clerk and re-registered by a **different person** (the local row is stale because the `user.updated` webhook was lost or not yet processed), the new person silently inherits the old row's `users.id` — including `stripe_customers`/`stripe_subscriptions` linkage (paid access), attempts, and bookmarks — while the original user's next sign-in mints a fresh empty row.

Symmetrically, when the acting Clerk user **already has their own row** (email change to a stale-held email), the fallback UPDATE violates [`users_clerk_user_id_uq`](../../db/schema.ts#L146) and maps to an opaque `ApplicationError('CONFLICT')` ([L38-L43](../../src/adapters/repositories/drizzle-user-repository.ts#L38-L43)), deterministically failing every `requireUser()` route and every `user.updated` webhook retry for that user until manual DB intervention. BUG-147 ruled on the same-identity recreation case only; neither the cross-identity takeover nor the actor-has-own-row lockout was considered, and the unit tests ([`drizzle-user-repository.test.ts#L232`](../../src/adapters/repositories/drizzle-user-repository.test.ts#L232), [`#L268`](../../src/adapters/repositories/drizzle-user-repository.test.ts#L268)) bless only the migration mechanics.

## Reachability

Both callers of `upsertByClerkId` are production-hot: the lazy sign-in upsert in [`clerk-auth-gateway.ts#L68`](../../src/adapters/gateways/clerk-auth-gateway.ts#L68) (per [DEBT-436](../_archive/debt/debt-436-stale-spec-docs-claim-user-created-webhook-handling.md), there is no `user.created` webhook — this lazy upsert is the *only* provisioning path, so sign-in is a first-class trigger surface) and the `user.updated` webhook handler at [`clerk-webhook-controller.ts#L285`](../../src/adapters/controllers/clerk-webhook-controller.ts#L285).

Preconditions are hard: a permanent or in-window `user.updated` webhook loss (so the local `users.email` is stale relative to Clerk), followed by re-registration of the freed email by a different Clerk identity, or an email change by a user who already owns a row. Not user-triggerable at will, but any occurrence is silent.

## Reproduction

**Takeover leg:**

1. Row `{clerk_user_id = A, email = X, updated_at = T0}` exists and holds an active paid subscription via `stripe_customers` → `stripe_subscriptions` linkage.
2. User A renames X → Y in Clerk. The `user.updated` webhook is lost (or still in flight), and A does not sign in — the local row keeps `email = X` ([`clerk-webhook-controller.ts#L285`](../../src/adapters/controllers/clerk-webhook-controller.ts#L285) never runs).
3. Person B registers the now-free email X in Clerk and signs in. [`clerk-auth-gateway.ts#L68`](../../src/adapters/gateways/clerk-auth-gateway.ts#L68) calls `upsertByClerkId(B, X, { observedAt })`.
4. The INSERT ([drizzle-user-repository.ts#L80-L95](../../src/adapters/repositories/drizzle-user-repository.ts#L80-L95)) hits `users_email_uq` ([`db/schema.ts#L147`](../../db/schema.ts#L147)); the fallback UPDATE's CASE ([L114](../../src/adapters/repositories/drizzle-user-repository.ts#L114), `T0 < observedAt`) reassigns A's row to B.

Expected: B gets a fresh user row; A's row, subscription, and history stay A's.

Actual: B inherits A's `users.id`, Stripe linkage, attempts, and bookmarks. A's next sign-in inserts a fresh empty row — silent data loss and paid access transferred. (If instead `updated_at >= observedAt`, the CASE makes the UPDATE a no-op on `clerk_user_id`, but the repo still returns A's row as B's user — identity confusion without reassignment.)

**Lockout leg:**

1. Actor B already has row `{clerk = B, email = Z}` and changes their Clerk email to stale-held X (whose row still says `clerk = A`).
2. The INSERT conflicts on the `clerkUserId` target first; the `onConflictDoUpdate` `SET email = X` ([L91](../../src/adapters/repositories/drizzle-user-repository.ts#L91)) raises `users_email_uq`.
3. The fallback UPDATE then tries to set `clerk_user_id = B` on A's row while B's own row exists → [`users_clerk_user_id_uq`](../../db/schema.ts#L146) violation → `mapDbError` → `CONFLICT` ([L38-L43](../../src/adapters/repositories/drizzle-user-repository.ts#L38-L43)).

Expected: the upsert resolves deterministically to B's row with the new email, or fails with an actionable, distinct error.

Actual: every `getCurrentUser()`/`requireUser()` call and every `user.updated` webhook delivery for B fails deterministically with opaque `CONFLICT` until manual DB surgery.

## Root Cause

The fallback conflates *email* with *identity*. [BUG-147's expected behavior](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) — "If the incoming email already exists with a different `clerk_user_id`, the existing `users` row should be updated to the new Clerk user ID" — is correct for its motivating case (same human, recreated Clerk account) but is applied unconditionally:

- [`drizzle-user-repository.ts#L111-L118`](../../src/adapters/repositories/drizzle-user-repository.ts#L111-L118): the fallback UPDATE keys the row purely on `WHERE email = <incoming>` and rewrites `clerk_user_id` when the stored `updated_at` is older than `observedAt`, with no check that the stored Clerk ID is actually defunct in Clerk, and no check that the incoming Clerk ID doesn't already own another row.
- The timestamp CASE guards against *out-of-order events for the same identity* ([DEBT-084](../_archive/debt/debt-084-user-email-race-condition.md)'s `observedAt` ordering — orthogonal to this bug) but says nothing about *which human* owns the email now.
- When the reassignment collides with `users_clerk_user_id_uq` ([`db/schema.ts#L146`](../../db/schema.ts#L146)), the generic `mapDbError` swallows the constraint name, so the deterministic lockout surfaces as the same `CONFLICT` used for transient races.

## Impact

When triggered, the takeover leg is P1-class: paid access (Stripe customer/subscription linkage) and full practice history silently transfer to a different human, and the original user loses their history with no error anywhere. The lockout leg is a deterministic denial of service for one user across every authenticated route and webhook retry, recoverable only by manual DB intervention. Neither leg produces a log that names both Clerk IDs, so occurrences are invisible in production.

Severity is P3, not P1/P2, because the reachability preconditions are hard: a lost or long-delayed `user.updated` webhook *plus* real-world reuse of the freed email by a different registrant (or an email change onto a stale-held address). The impact-when-triggered vs. likelihood trade is the same one this register uses elsewhere; the fix should still land because the failure is silent when it happens.

## Proposed Fix

**Option 1 (recommended):** Before the fallback reassignment, verify via the Clerk Backend API that the stored `clerk_user_id` on the email-holding row no longer exists in Clerk (the BUG-147 same-person recreation case). If it still exists, do NOT reassign — throw a distinct typed error (e.g. `CONFLICT` with a stable `EMAIL_OWNED_BY_OTHER_IDENTITY` marker) and log both Clerk IDs, surfacing the conflict instead of auto-merging identities. This preserves BUG-147's intended self-heal (same email, recreated Clerk account heals to the existing row) while blocking cross-identity takeover.

**Option 2 (minimal hardening — fixes the lockout, makes takeover observable):** In the fallback, first check whether a row already exists for the incoming `clerkId`; if so, resolve deterministically without reassignment (e.g. tombstone/suffix the stale row's email so the actor's own row can take it) instead of letting the UPDATE die on `users_clerk_user_id_uq`. Additionally emit a structured warn log with old/new Clerk IDs on every actual reassignment, for audit.

**Option 3 (debt route):** Keep current behavior but file a decision doc extending the BUG-147 ruling to the cross-identity case, and add the reassignment audit log so takeovers are at least detectable in production.

Constraint on all options: the fallback is the deliberate BUG-147 fix, so any remediation must preserve its recovery property — a same-identity Clerk-account recreation must still self-heal to the existing row without manual intervention.

## Related

- [BUG-283](./bug-283-clerk-webhook-email-reclaim-dead-in-transaction.md) — the mechanical sibling on the same fallback: inside the Clerk webhook transaction the recovery UPDATE never runs at all (25P02). Today that dead path confines this bug's takeover leg to the sign-in surface; fixing BUG-283 extends it to the webhook path, so weigh the two together.
- [BUG-147](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) — introduced the fallback; ruled on the same-identity recreation case only. Not a duplicate ruling on this bug: its analysis, repro, and tests never weighed the different-human takeover or the actor-has-own-row lockout.
- [DEBT-084](../_archive/debt/debt-084-user-email-race-condition.md) — the `observedAt` timestamp-ordering guard; orthogonal (same-identity event ordering, not identity ownership).
- [DEBT-436](../_archive/debt/debt-436-stale-spec-docs-claim-user-created-webhook-handling.md) — confirms there is no `user.created` webhook; the lazy sign-in upsert is the only provisioning path, making the sign-in surface a first-class trigger.
- The 2026-06-30 sweep's auth coverage-ledger row in `docs/bugs/index.md` verified a *different* Clerk-webhook-vs-provisioning race and found it a non-issue; that finding does not cover this fallback path.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
