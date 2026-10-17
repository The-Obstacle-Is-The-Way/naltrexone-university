# BUG-349: The Fake Consent Repository Keeps a Later Termination That Postgres Ignores

**Status:** Open — choose the termination rule, keep it in one place, and add the fake↔real scenario that fails today
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

When a subscription terminates, its renewal-consent records get a termination time and a retain-until date. That rule is written twice, and the two copies disagree.

- **Production** (the Drizzle repository) updates only rows whose termination is still null, so the **first** observation wins. Its `GREATEST(...)` expression is therefore dead code.
- **The fake** calls the domain function `terminateRenewalConsentRecord`, where the **latest** observation wins. No production code calls that function.

For a later replay, the fake moves the termination and retention forward; Postgres keeps the first. Retention is also computed twice: Postgres interval arithmetic in SQL, and `setUTCFullYear` in the domain. For a termination on 29 February, the two give retain-until dates a day apart.

Tests split along the same line. The integration test pins first-wins, including a later replay. The fake's test of the same name stops at an earlier replay, where both agree. The fake-contract register lists no divergence for this fake.

The fake suite and production run different rules, the problem DEBT-472 and DEBT-519 exist to prevent.

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
- `docs/guides/testing/fake-contracts.md` lists the consent fake with no divergence.

**The callers** pass two different clocks:
- the Stripe event time (`stripe-webhook-controller.ts`);
- reconcile's observation time (`reconcile-stripe-subscriptions.ts:289`).

**Other rules copied into fakes without a shared scenario** (they agree today):
- **Draft-save ordering:** `drizzle-practice-session-repository.ts:735-748` and `fake-practice-session-repository.ts:334-347`. The fake also uses a `new Date()` that cannot be injected.
- **Feedback replay identity:** `drizzle-question-feedback-repository.ts:25` and `fake-question-feedback-repository.ts:19`, commented "Mirror the Drizzle adapter".
- **Active-exam visibility:** the real query joins the session live (`shared/active-exam-visibility.ts:16-21`), while the fake reads a per-attempt copy set at seed time. This is unreachable today, because an active exam holds no attempts.

**History:**
- DEBT-455: the fake user repository diverged from the real upsert.
- DEBT-451 part 4: a fake lacked the one-incomplete-session rule.
- DEBT-435: fake and real CONFLICT behavior differed.
- DEBT-472 and DEBT-519: unverified doubles.

## Impact

A use-case test on the fake can pass with a retention date production would never write. Production rarely sees two termination observations for one subscription, and the error is at most a year of retention, erring long. P3. The broader pattern matters more: a rule copied into a fake drifts unless one scenario runs against both.

## Options

1. **Decide the rule, then keep one copy.**
   - First-wins is the natural reading of "terminated at": a subscription ends once.
   - Delete the dead `GREATEST`, and compute retention in one place: in SQL from shared constants, or in the domain with the adapter writing the result.
   - Make the fake match.
   - Add a fake↔real scenario table for consent termination, and for the three copied rules above.

   *Recommended.*
2. **Make the fake first-wins only.** That fixes today's divergence and leaves the duplicated retention arithmetic.

## Resolution (proposed)

Option 1, red first: a shared contract scenario with a later replay and a 29 February termination fails against the fake today. Record the outcome in the fake-contract register.

## Verification

- [ ] One consent-termination scenario runs against the fake and Postgres, including a later replay and a leap day.
- [ ] Retention is computed in one place.
- [ ] The register row for the consent fake names its contract evidence.

## Related

- DEBT-519: adapter-owned fakes missing from the register.
- DEBT-472 and DEBT-455 (closed): test-double fidelity.
- DEBT-414: the renewal-consent retention rules.
