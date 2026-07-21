# BUG-284: User Upsert Email-Conflict Fallback Treats Email as Identity — Cross-Identity Row Takeover and Sign-In Lockout

**Status:** Resolved
**Severity:** P2
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; Cycle B1 re-audit confirmed the defect, corrected the caller-specific failure modes, and rejected the original unsafe fix)
**Component:** User provisioning / identity

---

## Resolution (2026-07-11)

Fixed in PR #628 (squash `45bf6232` to dev), promoted via PR #630 (main `6b9fab48`); production deploy succeeded and `https://addictionboards.com/` returned HTTP/2 200. The email-reclaim reassignment fallback was deleted, not patched: the repository now raises a typed, non-mutating `UserEmailOwnershipConflictError` (CONFLICT, reason `user_email_owned_by_another_identity`, carrying the owning Clerk ID), and identity resolution moved to a dedicated `clerk-user-provisioner` seam — external Clerk lookups outside any transaction, positive identity-continuity proof required before any mutation (old-ID nonexistence proves nothing, per this doc's ruling), a stale-observation re-check before applying, same-identity email sync via new savepoint-wrapped `updateEmailByClerkId`, and structured two-ID logs at every decision point. The four-case regression matrix from this doc is pinned in unit + real-Postgres integration tests. Follow-ups filed from the wave-close review: [DEBT-455](../debt/debt-455-fake-user-repository-fidelity-divergences.md) (fake-fidelity divergences) and [DEBT-456](../../debt/debt-456-client-conflict-reason-discrimination-gaps.md) (client arms lack reason discrimination for the new conflict).


## Summary

The `users_email_uq` fallback in [`DrizzleUserRepository.upsertByClerkId`](../../../src/adapters/repositories/drizzle-user-repository.ts#L106-L131) — shipped as the [BUG-147](./bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) fix — runs `UPDATE users SET clerk_user_id = <incoming> WHERE email = <incoming>` ([L114](../../../src/adapters/repositories/drizzle-user-repository.ts#L114), [L117](../../../src/adapters/repositories/drizzle-user-repository.ts#L117)), assuming an email conflict always means the same human re-appeared under a new Clerk ID. When the email was instead freed in Clerk and re-registered by a **different person** while the local row still carries the old email, the new person can silently inherit the old row's `users.id` — including `stripe_customers`/`stripe_subscriptions` linkage (paid access), attempts, and bookmarks — while the original user's next sign-in creates a fresh empty row.

Symmetrically, when the acting Clerk user **already has their own row** (email change to a stale-held email), the raw-db sign-in path reaches a fallback UPDATE that violates [`users_clerk_user_id_uq`](../../../db/schema.ts#L146) and maps to an opaque `ApplicationError('CONFLICT')` ([L38-L43](../../../src/adapters/repositories/drizzle-user-repository.ts#L38-L43)). The tx-bound `user.updated` webhook does not reach that second uniqueness violation today: the first failed statement aborts the outer transaction and [BUG-283](./bug-283-clerk-webhook-email-reclaim-dead-in-transaction.md) converts the fallback attempt's `25P02` to `INTERNAL_ERROR`. BUG-147 ruled on the same-identity recreation case only. The Drizzle unit tests ([`drizzle-user-repository.test.ts#L232`](../../../src/adapters/repositories/drizzle-user-repository.test.ts#L232), [`#L268`](../../../src/adapters/repositories/drizzle-user-repository.test.ts#L268)) and fake test ([`fake-user-repository.test.ts#L89`](../../../src/application/test-helpers/fakes/fake-user-repository.test.ts#L89)) encode the reassignment/lockout mechanics, but none asks whether the two Clerk IDs represent the same human.

## Reachability

Both callers of `upsertByClerkId` are production-hot: the lazy sign-in upsert in [`clerk-auth-gateway.ts#L68`](../../../src/adapters/gateways/clerk-auth-gateway.ts#L68) and the `user.updated` webhook handler at [`clerk-webhook-controller.ts#L285`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L285). Per [DEBT-436](../debt/debt-436-stale-spec-docs-claim-user-created-webhook-handling.md), `user.created` is intentionally ignored and first authenticated access performs lazy provisioning. The `user.updated` upsert can nevertheless insert a missing row as a consequence of its repository semantics, so lazy sign-in is the intended provisioning path, not the only code path capable of inserting a user.

Preconditions are compound: a permanent or in-window `user.updated` delivery gap (so the local `users.email` is stale relative to Clerk), followed by re-registration of the freed email by a different Clerk identity, or an email change by a user who already owns a row. The takeover leg is silent; the lockout leg is noisy but non-diagnostic.

## Reproduction

**Takeover leg:**

1. Row `{clerk_user_id = A, email = X, updated_at = T0}` exists and holds an active paid subscription via `stripe_customers` → `stripe_subscriptions` linkage.
2. User A renames X → Y in Clerk. The `user.updated` webhook is lost (or still in flight), and A does not sign in — the local row keeps `email = X` ([`clerk-webhook-controller.ts#L285`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L285) never runs).
3. Person B registers the now-free email X in Clerk and signs in. [`clerk-auth-gateway.ts#L68`](../../../src/adapters/gateways/clerk-auth-gateway.ts#L68) calls `upsertByClerkId(B, X, { observedAt })`.
4. The INSERT ([drizzle-user-repository.ts#L80-L95](../../../src/adapters/repositories/drizzle-user-repository.ts#L80-L95)) hits `users_email_uq` ([`db/schema.ts#L147`](../../../db/schema.ts#L147)); the fallback UPDATE's CASE ([L114](../../../src/adapters/repositories/drizzle-user-repository.ts#L114), `T0 < observedAt`) reassigns A's row to B.

Expected: B gets a fresh user row; A's row, subscription, and history stay A's.

Actual: B inherits A's `users.id`, Stripe linkage, attempts, and bookmarks. A's next sign-in inserts a fresh empty row — the history remains stored but is associated with B, and paid access is transferred. (If instead `updated_at >= observedAt`, the CASE makes the UPDATE a no-op on `clerk_user_id`, but the repo still returns A's row as B's user — identity confusion without reassignment.)

**Lockout leg:**

1. Actor B already has row `{clerk = B, email = Z}` and changes their Clerk email to stale-held X (whose row still says `clerk = A`).
2. The INSERT conflicts on the `clerkUserId` target first; the `onConflictDoUpdate` `SET email = X` ([L91](../../../src/adapters/repositories/drizzle-user-repository.ts#L91)) raises `users_email_uq`.
3. The fallback UPDATE then tries to set `clerk_user_id = B` on A's row while B's own row exists → [`users_clerk_user_id_uq`](../../../db/schema.ts#L146) violation → `mapDbError` → `CONFLICT` ([L38-L43](../../../src/adapters/repositories/drizzle-user-repository.ts#L38-L43)).

Expected: the upsert resolves deterministically to B's row with the new email, or fails with an actionable, distinct error.

Actual: every raw-db `getCurrentUser()`/`requireUser()` resolution for B fails deterministically with opaque `CONFLICT` while Clerk continues presenting the conflicting email. The tx-bound webhook retries fail through BUG-283 as `INTERNAL_ERROR`, not this fallback's `CONFLICT`. Changing the conflicting Clerk email or repairing the database can clear the condition; manual DB surgery is not the only possible recovery.

## Root Cause

The fallback conflates *email* with *identity*. [BUG-147's expected behavior](./bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) — "If the incoming email already exists with a different `clerk_user_id`, the existing `users` row should be updated to the new Clerk user ID" — is correct for its motivating case (same human, recreated Clerk account) but is applied unconditionally:

- [`drizzle-user-repository.ts#L111-L118`](../../../src/adapters/repositories/drizzle-user-repository.ts#L111-L118): the fallback UPDATE keys the row purely on `WHERE email = <incoming>` and rewrites `clerk_user_id` when the stored `updated_at` is older than `observedAt`, with no check that the stored Clerk ID is actually defunct in Clerk, and no check that the incoming Clerk ID doesn't already own another row.
- The timestamp CASE guards against *out-of-order events for the same identity* ([DEBT-084](../debt/debt-084-user-email-race-condition.md)'s `observedAt` ordering — orthogonal to this bug) but says nothing about *which human* owns the email now.
- On the raw-db path, when the reassignment collides with `users_clerk_user_id_uq` ([`db/schema.ts#L146`](../../../db/schema.ts#L146)), the generic `mapDbError` swallows the constraint name, so the deterministic lockout surfaces as the same `CONFLICT` used for transient races. The webhook's transaction-abort behavior is the separate BUG-283 mechanism described above.

## Impact

When triggered, the takeover leg crosses an authorization boundary: paid access (Stripe customer/subscription linkage) and full practice history silently transfer to a different human, and the original user loses access to that history with no application error. The lockout leg is a deterministic denial of service for one user across authenticated routes while the conflicting Clerk email remains. Neither leg produces a structured audit record naming both Clerk IDs. The takeover is therefore silent; the lockout is visible through route/webhook errors but its identity conflict is not diagnosable from the emitted error alone.

Severity is P2 rather than P1 because the compound delivery-gap/email-reuse precondition limits frequency and the blast radius is one account per occurrence. It is not P3: the takeover leg is a silent cross-identity authorization and data-isolation breach, including paid entitlement and practice-history transfer, so low likelihood does not reduce it to routine operational debt.

## Proposed Fix

**Option 1 (recommended): fail closed unless identity continuity is positively proven.** Remove the repository's unconditional cross-Clerk-ID reassignment by email. The persistence adapter should surface a typed, non-mutating email-ownership conflict; an application-level identity-resolution flow may then consult a Clerk gateway and log both IDs. If the stored Clerk identity still exists and Clerk reports that it moved to a different email, synchronize that row to its current email and retry the incoming insert. If the stored Clerk identity no longer exists, that fact alone does **not** prove the incoming account is the same human — a deleted account followed by email reuse looks identical — so require an explicit, auditable account-recovery/transfer proof or owner intervention. Do not call the Clerk SDK from the Drizzle repository; external identity verification belongs outside the persistence adapter.

**Option 2 (minimum safe behavior):** Always reject a cross-Clerk-ID email conflict with a stable typed reason and never mutate either row automatically. This closes takeover and makes the actor-already-has-a-row case actionable, at the cost of removing BUG-147's automatic same-person recovery until the explicit recovery flow exists. Log the old/new Clerk IDs at the controller/gateway boundary with the repository error; do not silently suffix or tombstone an email because that is another identity mutation without proof.

**Option 3 (not sufficient as a fix):** Keep reassignment but add an audit log. This improves detection only; it deliberately accepts the authorization breach and therefore requires an explicit owner security ruling rather than being presented as remediation.

The original proposal to check only whether the old Clerk ID still exists was rejected during this audit: nonexistence cannot distinguish same-person recreation from different-person email reuse. BUG-147's automatic recovery property may be preserved only when a stronger, independently verifiable continuity signal exists; otherwise the security invariant (never merge identities by email alone) takes precedence. Fix BUG-283's savepoint mechanics together with or after this semantic change so making the webhook fallback executable does not expand the takeover surface.

Required regression proof: use real persistence for the uniqueness behavior and cover both raw-db and tx-bound callers. Pin (1) A moves `X → Y`, then different person B claims X: A keeps the original `users.id`/history and B gets a distinct row; (2) old Clerk ID absent: no automatic reassignment without an explicit continuity proof; (3) B already owns a row: a stable typed conflict is returned without mutating either row; and (4) any retained same-person recovery requires the chosen positive proof and leaves a structured audit event.

## Implementation Notes (fix branch)

**Implemented 2026-07-10 on `fix/bug-283-284-user-upsert-identity`; merged and production-verified 2026-07-11 — see the Resolution section above.** The failure analysis above describes the branch point, `origin/dev` at `64204014`.

- [`DrizzleUserRepository`](../../../src/adapters/repositories/drizzle-user-repository.ts#L18-L173) now maps `users_email_uq` consistently for both upsert and existing-row email synchronization, returning a non-mutating `UserEmailOwnershipConflictError` with the stable `user_email_owned_by_another_identity` reason and current owner ID. Both constraint-raising writes are scoped to a nested transaction/savepoint so classification leaves a transaction-bound caller usable, and the repository no longer rewrites `clerk_user_id` by email.
- [`clerk-user-provisioner.ts`](../../../src/adapters/gateways/clerk-user-provisioner.ts#L86-L321) is the shared identity-resolution module. `ensureClerkUser` orchestrates the raw-db sign-in path; the webhook uses the same validation, external-resolution, and apply functions as separate phases so Clerk lookup retries run outside its database transactions. Both callers revalidate that the incoming Clerk ID is absent and that the same local owner still holds the email before synchronizing through the non-inserting `updateEmailByClerkId` path. Every two-ID outcome emits one structured log containing both Clerk IDs and no email address.
- The real-Postgres regression in [`user-repository.integration.test.ts`](../../../tests/integration/user-repository.integration.test.ts#L273-L374) proves the moved owner retains its original `users.id`, Stripe customer/subscription linkage, attempt, and bookmark while the incoming identity receives a distinct row. Unit coverage separately pins absent-owner fail-closed behavior and the no-mutation actor-already-owns-a-row rule on raw and webhook callers.

## Related

- [BUG-283](./bug-283-clerk-webhook-email-reclaim-dead-in-transaction.md) — the mechanical sibling on the same fallback: inside the Clerk webhook transaction the recovery UPDATE never runs at all (25P02). Today that dead path confines both this bug's takeover behavior and its `users_clerk_user_id_uq` classification to the raw-db sign-in surface; fixing BUG-283 without fixing this semantic bug would extend them to the webhook path.
- [BUG-147](./bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) — introduced the fallback; ruled on the same-identity recreation case only. Not a duplicate ruling on this bug: its analysis, repro, and tests never weighed the different-human takeover or the actor-has-own-row lockout.
- [DEBT-084](../debt/debt-084-user-email-race-condition.md) — the `observedAt` timestamp-ordering guard; orthogonal (same-identity event ordering, not identity ownership).
- [DEBT-436](../debt/debt-436-stale-spec-docs-claim-user-created-webhook-handling.md) — confirms `user.created` is intentionally a no-op and lazy sign-in is the intended provisioning design. The live `user.updated` upsert can still insert a missing row, so "only provisioning path" is not a literal code invariant.
- The 2026-06-30 sweep's auth coverage-ledger row in `docs/bugs/index.md` verified a *different* Clerk-webhook-vs-provisioning race and found it a non-issue; that finding does not cover this fallback path.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
