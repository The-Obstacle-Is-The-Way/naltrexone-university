# DEBT-455: `FakeUserRepository` Diverges From Real Upsert Semantics — Ownership-Check Ordering and the Missing `updatedAt` Bump

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-11
**Re-verified accurate against `ddad8eee` on 2026-07-18.**
**Resolved:** 2026-07-21 — FW-1 reordered the fake's existing-identity staleness/same-email decisions ahead of foreign-email ownership and made the same-email path store `max(existing.updatedAt, observedAt)`. Paired production-shaped fake and real-PostgreSQL tests now pin the demonstrated stale/foreign-email no-op and monotonic timestamp behavior without adding a generalized contract harness.

---

## Direction (2026-07-21 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Ownership-check ordering | **FIX (Steps 1 + 3, minimal form)** | Move the fake's existing-identity staleness/same-email decisions ahead of the foreign-email ownership lookup, then add the mirrored fake test and the missing real-Postgres stale-existing-identity/foreign-email integration case. | A partial fake-only change without real-side proof; a generalized fake contract harness or full Cartesian matrix beyond the two demonstrated divergences. | (a) Reorders existing logic and adds no abstraction; (b) fake and real outcomes were directly reproduced; (c) Blast radius: a future replay test can certify a CONFLICT where production silently preserves newer state. Fix cost: one local reorder plus one paired scenario; (d) LSP requires fake/real semantic parity; (e) applies the campaign-wide fake-fidelity law. |
| 2. Same-email `updatedAt` bump | **FIX (Steps 2 + 3, minimal form)** | Apply the real adapter's `GREATEST(updatedAt, observedAt)` behavior before the fake's same-email return and pin the clock effect in paired contract-style coverage. | Leaving timestamp semantics implicit; fixing only the returned object without updating stored fake state; a new clock abstraction. | (a) One assignment aligns the existing fake; (b) the three-timestamp divergence was directly reproduced; (c) Blast radius: a later stale event can mutate the fake after production would reject it. Fix cost: one stored-state update plus a focused test; (d) production-shaped fixtures must observe the same state transition; (e) matches DEBT-451.4, DEBT-443.3, and DEBT-457.3. |

Both parts are mandatory fake-fidelity repairs: no smaller form closes the demonstrated LSP gaps, and neither adds production machinery. Tests must execute production-shaped scenarios and prove the mutation/no-mutation state, not merely compare return values. Broader repository-wide fake frameworks are outside this debt.

## Description

Two fidelity divergences between [`FakeUserRepository`](../../../src/application/test-helpers/fakes/fake-user-repository.ts) and [`DrizzleUserRepository`](../../../src/adapters/repositories/drizzle-user-repository.ts) introduced with the PR #628 identity fix, both empirically confirmed during the 2026-07-11 wave-1 close review by running the same scenarios against the fake and real Postgres. No currently shipped test passes for the wrong reason; the risk is that future tests written against the fake encode anti-production semantics.

### 1. `upsertByClerkId` checks email ownership before the staleness clock-guard, inverting real ordering for existing identities

For an **existing** incoming identity with a **stale** `observedAt` and a target email **owned by another identity**, the fake throws `UserEmailOwnershipConflictError` (the byEmail check at [fake-user-repository.ts#L46-L54](../../../src/application/test-helpers/fakes/fake-user-repository.ts#L46) runs before the `updatedAt >= observedAt` guard at [#L63-L65](../../../src/application/test-helpers/fakes/fake-user-repository.ts#L63)), while real Postgres resolves the `ON CONFLICT (clerk_user_id)` arbiter first and the CASE clock-guard keeps the old email ([drizzle-user-repository.ts#L120-L127](../../../src/adapters/repositories/drizzle-user-repository.ts#L120)) — no `users_email_uq` violation, a silent no-op commit. The mid-PR stale-ordering correction went only to `updateEmailByClerkId` (which the fake orders correctly and pins at [fake-user-repository.test.ts#L181-L200](../../../src/application/test-helpers/fakes/fake-user-repository.test.ts#L181)), so the fake's two methods now disagree with each other on ordering. The input shape is production-real: [clerk-webhook-controller.ts#L321-L322](../../../src/adapters/controllers/clerk-webhook-controller.ts#L321) passes event-derived `observedAt` into `upsertByClerkId`, so an out-of-order `user.updated` replay after an email moved between accounts hits exactly this case — production silently no-ops where the fake fails closed.

### 2. Same-email early return skips the `GREATEST(updatedAt)` bump the real adapter always applies

On unchanged email the fake returns the stored user without touching `updatedAt` ([fake-user-repository.ts#L58-L61](../../../src/application/test-helpers/fakes/fake-user-repository.ts#L58)), but the real upsert unconditionally executes `updatedAt = GREATEST(users.updatedAt, observedAt)` ([drizzle-user-repository.ts#L124](../../../src/adapters/repositories/drizzle-user-repository.ts#L124)), pinned by [user-repository.integration.test.ts#L131-L140](../../../tests/integration/user-repository.integration.test.ts#L131). Divergent scenario (executed): `upsert(X, t1)` → `upsert(X, t3)` → `updateEmailByClerkId(Y, t2)` with `t1 < t2 < t3`: real Postgres holds `updatedAt = t3` and rejects `t2` as stale (email stays X); the fake holds `t1` and applies Y. No fake test asserts the bump ([fake-user-repository.test.ts#L35-L45](../../../src/application/test-helpers/fakes/fake-user-repository.test.ts#L35) checks only id/email).

## Impact

Test-infrastructure fidelity only — production behavior is unaffected and no existing test relies on either divergent branch (the `clerk-user-provisioner` unit tests use strictly forward-moving `observedAt` values). The latent cost is concrete: a future webhook-replay or out-of-order-event unit test built on the fake would observe a typed CONFLICT (part 1) or last-writer-wins (part 2) where production does the opposite, certifying wrong semantics with green tests — the exact LSP failure mode the register's fake-fidelity law exists to prevent (precedents: DEBT-443 part 3, DEBT-451 part 4). P4: latent, no current wrong-passing test, mechanical fix.

## Proposed Resolution

1. **CHOSEN, minimal form:** In `FakeUserRepository.upsertByClerkId`, move the byEmail ownership check after the existing-row same-email/staleness guards, mirroring `updateEmailByClerkId`'s corrected ordering and the SQL arbiter/CASE semantics.
2. **CHOSEN, minimal form:** In the same-email branch, set and store `updatedAt = max(existing.updatedAt, observedAt)` before returning.
3. **CHOSEN, required proof:** Add mirrored fake tests for both behaviors: the existing+stale+foreign-email no-op (asserting no throw and no mutation, matching the real adapter), and the `updatedAt` bump on same-email re-upsert (mirroring the integration assertion). Add the missing real-side integration case for existing+stale+foreign-email through `upsertByClerkId` (currently covered only for non-existing incoming identities). A generalized repository-wide fake contract harness is rejected as disproportionate.

## Verification

Contract-style paired tests: the same scenario table executed against `FakeUserRepository` (unit) and `DrizzleUserRepository` (integration) asserts identical outcomes for {existing?, stale?, email-owned-by-other?} × {upsert, updateEmail}. The two scenarios above flip from divergent to identical; the existing pinned behaviors (fresh-conflict fail-closed, stale updateEmail no-op) stay green.

## Related

- [BUG-284 (archived, resolved PR #628)](../bugs/bug-284-user-upsert-email-reclaim-cross-identity-takeover.md) — the fix that introduced both methods; its regression matrix covers the fresh-observation paths, not these stale-path orderings.
- [DEBT-451](./debt-451-attempts-integrity-enforcement-and-verification-gaps.md) part 4 and [DEBT-443](../../debt/debt-443-idempotency-cache-durability-and-evolution.md) part 3 — the register's fake-fidelity precedents.
- Found during the 2026-07-11 wave-1 close adversarial regression review; both divergences reproduced by executing the scenarios against the fake and real Postgres.
