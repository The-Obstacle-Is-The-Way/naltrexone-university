# BUG-349: The Fake Consent Repository Keeps a Later Termination That Postgres Ignores

**Status:** Verifying — promotion to main of the shared first-observation and retention rule; due 2026-10-31
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

At `134b0578`, when a subscription terminates, its renewal-consent records get a termination time and a retain-until date. That rule is written twice, and the two copies disagree.

- **Production** (the Drizzle repository) updates only rows whose termination is still null, so the **first** observation wins. The maximum against the existing termination timestamp is redundant under that null predicate. The separate retention maximum still preserves the longer retention floor.
- **The fake** calls the domain function `terminateRenewalConsentRecord`, where the **latest** observation wins. No production code calls that function.

For a later replay, the fake moves the termination forward and can extend retention; the three-year consent floor can mask the retention change. Postgres keeps the first. Even an equal/earlier replay differs: the fake counts matching rows and updates `updatedAt`, while Postgres returns zero changed rows and preserves the timestamp. Retention is also computed twice: Postgres interval arithmetic in SQL, and `setUTCFullYear` in the domain. When the termination floor dominates, a February 29 termination gives March 1 of the next year in the domain and February 28 in PostgreSQL; local probes of both reproduce the one-day difference. For consents captured since August 2026, February 29, 2032 is the first leap-day termination whose one-year floor can exceed the consent floor.

Corrected 2026-10-19: this said the first leap day production can reach is February 29, 2032 because consent records began in 2026. The bound is when a leap-day termination's one-year floor can exceed the three-year consent floor, which holds from consents captured in August 2026.

Production's rule was chosen: DEBT-414's hardening (`1aa4c814`, #751) added the null check and a later-replay assertion, and left the domain function and the fake keeping the latest time. Tests split along the same line. The integration test pins first-wins, including a later replay. The fake's test of the same name stops at an earlier replay, where their termination and retention dates agree. The fake-contract register's row for this fake is a dated waiver claiming no parity, and its divergence list omits this one.

The fake suite and production run different rules: the problem DEBT-472 addressed and DEBT-519 still tracks.

## Evidence

These source receipts refer to `134b0578`, before the fix.

**Production:**
- `src/adapters/repositories/drizzle-renewal-consent-record-repository.ts:151-173`.
- `:159`: `subscriptionTerminatedAt: GREATEST(COALESCE(existing, new), new)`.
- `:160`: retention by `+ INTERVAL '3 years'` and `'1 year'`.
- `:169`: `isNull(subscriptionTerminatedAt)` in the `WHERE`.

**The domain and the fake:**
- `src/domain/entities/renewal-consent-record.ts:119-138`: latest wins.
- `src/domain/value-objects/renewal-consent.ts`: `computeRenewalConsentRetainUntil`, through `setUTCFullYear`.
- `src/application/test-helpers/fakes/fake-renewal-consent-record-repository.ts:140-156` calls the domain function for every matching record and counts them all.

**The tests:**
- The integration test pins first-wins with a later replay (`tests/integration/renewal-consent-records.integration.test.ts`).
- The fake's test (`fake-renewal-consent-record-repository.test.ts`) stops before that case.
- `docs/guides/testing/fake-contracts.md:66`: a dated waiver (2026-08-23) for the consent fake; its known divergences omit this one.

**The callers** pass two different clocks:
- the Stripe event time (`stripe-webhook-controller.ts`);
- reconcile's observation time (`reconcile-stripe-subscriptions.ts:289`).

The three other copied rules, draft-save ordering, feedback replay identity and active-exam visibility, are recorded in their fakes' rows in the fake-contract register.

**History:**
- DEBT-455: the fake user repository diverged from the real upsert.
- DEBT-451 part 4: a fake lacked the one-incomplete-session rule.
- DEBT-435: fake and real CONFLICT behavior differed.
- DEBT-472 and DEBT-519: unverified doubles.

## Impact

Before the fix, a use-case test could pass with a termination time, `updatedAt` or retention date production would not write. The returned row count also differs, though no caller reads it. Retention can move by up to the observation gap, depending on the consent floor. Production implements the chosen first-observation rule. Webhooks and reconciliation can both observe termination; production frequency was not measured. P3, under DEBT-472's fidelity yardstick. The broader pattern matters more: a rule copied into a fake drifts unless one scenario runs against both.

## Options

1. **Keep production's rule, in one copy.**
   - First-wins is DEBT-414's rule, and the natural reading of "terminated at": a subscription ends once.
   - Remove the redundant termination maximum. Keep `computeRenewalConsentRetainUntil` as the only calculator (ADR-027 Decision 5), in UTC, where February 29 plus one year is March 1 (the longer reading). The adapter passes the domain's termination floor into the same conditional update: `retain_until = GREATEST(retain_until, $floor) … WHERE subscription_terminated_at IS NULL`.
   - Make the fake match.
   - Add the shared consent-termination scenarios, including row count and timestamp behavior. Note the three other examples in their fakes' rows of the fake-contract register; scenarios for them are out of scope here.

   *Recommended.*
2. **Make the fake first-wins only.** That fixes today's divergence and leaves the duplicated retention arithmetic.

## Resolution (decided)

Option 1. The domain and fake keep the first termination observation. The fake returns zero for equal, earlier and later replays without changing `updatedAt` or retention. Both implementations preserve a longer existing retention floor.

`computeRenewalConsentRetainUntil` computes the UTC calendar floors. The adapter requests the termination floor alone and passes it into `GREATEST(retain_until, $floor)` under the existing null predicate. No SQL interval calculation or redundant termination maximum remains. February 29 plus one year is March 1.

Eight shared scenarios run against the fake and Postgres: three replay orders, the consent floor, a leap day, a longer existing floor, a stored floor that only the termination floor raises, and concurrent first observations. The real concurrent case uses separate database connections. The fake-contract register names this proof and preserves the three other examples in their own rows. Business rule R30 names the retention contract.

## Verification

- [x] One scenario runs against the fake and Postgres: first call; equal, earlier and later replays; a leap day; and two concurrent first calls (each row changes once, and the stored time is one of the two).
- [x] Retention is computed in one place.
- [x] The register row for the consent fake names its contract evidence.

- [ ] Promote the fix to main.

## Related

- DEBT-519: adapter-owned fakes missing from the register.
- DEBT-472 and DEBT-455 (closed): test-double fidelity.
- DEBT-414: the renewal-consent retention rules.
