# BUG-349: The Fake Consent Repository Keeps a Later Termination That Postgres Ignores

**Status:** Open — align the fake and domain with DEBT-414's first-wins rule, compute retention once, and add the fake↔real scenario that fails today
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

When a subscription terminates, its renewal-consent records get a termination time and a retain-until date. That rule is written twice, and the two copies disagree.

- **Production** (the Drizzle repository) updates only rows whose termination is still null, so the **first** observation wins. The maximum against the existing termination timestamp is redundant under that null predicate. The separate retention maximum still preserves the longer retention floor.
- **The fake** calls the domain function `terminateRenewalConsentRecord`, where the **latest** observation wins. No production code calls that function.

For a later replay, the fake moves the termination forward and can extend retention; the three-year consent floor can mask the retention change. Postgres keeps the first. Even an equal/earlier replay differs: the fake counts matching rows and updates `updatedAt`, while Postgres returns zero changed rows and preserves the timestamp. Retention is also computed twice: Postgres interval arithmetic in SQL, and `setUTCFullYear` in the domain. When the termination floor dominates, a February 29 termination gives March 1 of the next year in the domain and February 28 in PostgreSQL; local probes of both reproduce the one-day difference. Consent records began in 2026, so the first leap day production can reach is February 29, 2032.

Production's rule was chosen: DEBT-414's hardening (`1aa4c814`, #751) added the null check and a later-replay assertion, and left the domain function and the fake keeping the latest time. Tests split along the same line. The integration test pins first-wins, including a later replay. The fake's test of the same name stops at an earlier replay, where their termination and retention dates agree. The fake-contract register's row for this fake is a dated waiver claiming no parity, and its divergence list omits this one.

The fake suite and production run different rules: the problem DEBT-472 addressed and DEBT-519 still tracks.

## Evidence

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

**Other rules copied into fakes without a shared scenario** (no reachable mismatch found):
- **Draft-save ordering:** `drizzle-practice-session-repository.ts:735-748` and `fake-practice-session-repository.ts:334-347`. The fake also uses a `new Date()` that cannot be injected.
- **Feedback replay identity:** `drizzle-question-feedback-repository.ts:25` and `fake-question-feedback-repository.ts:19`, commented "Mirror the Drizzle adapter".
- **Active-exam visibility:** the real query joins the session live (`shared/active-exam-visibility.ts:16-21`), while the fake reads a per-attempt copy set at seed time. This is unreachable today, because an active exam holds no attempts.

**History:**
- DEBT-455: the fake user repository diverged from the real upsert.
- DEBT-451 part 4: a fake lacked the one-incomplete-session rule.
- DEBT-435: fake and real CONFLICT behavior differed.
- DEBT-472 and DEBT-519: unverified doubles.

## Impact

A use-case test can pass with a termination time, `updatedAt` or retention date production would not write. The returned row count also differs, though no caller reads it. Retention can move by up to the observation gap, depending on the consent floor. Production implements the chosen first-observation rule. Webhooks and reconciliation can both observe termination; production frequency was not measured. P3, under DEBT-472's fidelity yardstick. The broader pattern matters more: a rule copied into a fake drifts unless one scenario runs against both.

## Options

1. **Keep production's rule, in one copy.**
   - First-wins is DEBT-414's rule, and the natural reading of "terminated at": a subscription ends once.
   - Remove the redundant termination maximum. Keep `computeRenewalConsentRetainUntil` as the only calculator (ADR-027 Decision 5), in UTC, where February 29 plus one year is March 1 (the longer reading). The adapter passes the domain's termination floor into the same conditional update: `retain_until = GREATEST(retain_until, $floor) … WHERE subscription_terminated_at IS NULL`.
   - Make the fake match.
   - Add the shared consent-termination scenarios, including row count and timestamp behavior. Note the three other examples in their fakes' rows of the fake-contract register; scenarios for them are out of scope here.

   *Recommended.*
2. **Make the fake first-wins only.** That fixes today's divergence and leaves the duplicated retention arithmetic.

## Resolution (proposed)

Option 1, red first: a shared contract scenario covers first, equal, earlier and later observations; first call changes one row, replays change zero, and `updatedAt`/retention remain stable. Add a February 29 case with the termination floor dominating, and a concurrent first-observation case. Record the outcome in the fake-contract register.

## Verification

- [ ] One scenario runs against the fake and Postgres: first call; equal, earlier and later replays; a leap day; and two concurrent first calls (each row changes once, and the stored time is one of the two).
- [ ] Retention is computed in one place.
- [ ] The register row for the consent fake names its contract evidence.

## Related

- DEBT-519: adapter-owned fakes missing from the register.
- DEBT-472 and DEBT-455 (closed): test-double fidelity.
- DEBT-414: the renewal-consent retention rules.
