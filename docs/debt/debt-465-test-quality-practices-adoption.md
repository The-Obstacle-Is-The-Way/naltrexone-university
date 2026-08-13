# DEBT-465: Advanced Test-Quality Practices Adoption (CRAP Report, Mutation Testing, Acceptance Tests, UI QA Procedures)

**Status:** Open
**Priority:** P2
**Date:** 2026-08-13
**Source:** [ADR-019](../adr/adr-019-test-quality-practices.md) (Proposed) + the 2026-08-13 audit of the test estate
**Scope:** Execution of the four practices ADR-019 adopts. The runbooks are written and canonical; this item tracks the *work* — script, pilot, harness, and register activation. Owner-initiated waves; nothing here is a shortcut in shipped code.

---

## Description

The suite ADR-003 built is broad (556 test files, ~151k lines, four lanes) but nothing audits or specifies it from the outside. The audit made the gap concrete:

- `src/domain/services/grading.ts` — the product's core correctness function — has 5 tests; `subscription-write-guard.ts`, which decides whether a paying customer's stored subscription may be overwritten, has 21 table-driven cases nothing has ever audited for bite. No tool measures whether any of those tests would catch a flipped boundary.
- `src/adapters/repositories/drizzle-renewal-notice-delivery-repository.ts` (legally-required notice delivery state machine, 399 loc) has zero unit-lane tests; no ranked report surfaces such spots.
- Business rules exist only as code + unit tests; there is no UI-independent executable specification, so nothing structurally stops a rule from migrating into a component during agent iteration.
- A long list of UI surfaces has zero UI-level automation — enumerated in `docs/dev/qa-procedures.md` (rendered auth forms, error boundaries, billing-portal round-trip, the `/app/*` entitlement redirect gate, any mobile viewport) — and the operator checklist's "smoke-tested" item has no written procedure behind it.

## Impact

Agent-heavy development amplifies each gap: green suites that don't constrain behavior admit regressions; unspecified rules bleed into the UI layer; API-correct/UI-broken deliveries pass every gate. Triage of "what to test or refactor next" stays manual and unranked.

## Resolution

Four parts. Each part's step-by-step lives in its runbook (canonical); this doc tracks completion. Recommended order 1 → 2 → 3, with Part 4 proceeding in parallel; metrics stay observational per ADR-019's binding posture.

### Part 1 — CRAP report script
`docs/dev/code-quality-metrics.md` §5. TDD `scripts/crap-report.ts` (TS compiler API + merged istanbul coverage), add `quality:crap` + `istanbul-lib-coverage` devDep, produce the merged-lane baseline, reconcile the a-priori hotspot table against measured ranking.

### Part 2 — Mutation-testing pilot
`docs/dev/mutation-testing.md`. Install `@stryker-mutator/core` + `@stryker-mutator/vitest-runner`, land `stryker.config.json` with the 8 pinned pilot targets (`subscription-write-guard`, `entitlement`, `grading`, `exam-timer`, `statistics`, `shuffle` + `shuffled-choice-views`, `persist-subscription-observation`, `validate-feedback-context`), run the baseline, triage every survivor (missing test / equivalent-suppress-with-reason / dead code / wrong-lane / no-coverage descope), then widen to `src/domain/**` and add the weekly scheduled workflow. `typescript-checker` stays deferred behind the DEBT-460 TS6/TS7 seam.

### Part 3 — Acceptance-test harness
`docs/dev/acceptance-testing.md` §8. Install `@amiceli/vitest-cucumber`, build `tests/acceptance/support/application-driver.ts` verb-by-verb, land features #1 and #4 (session-start conflict; tutor/exam feedback split), then #2/#3/#10 (entitlement + trial). Update the Test Locations tables (`AGENTS.md`, `.claude/rules/testing.md`) in the first feature's PR. From then on new business rules ship their feature file first.

### Part 4 — UI QA register activation
`docs/dev/qa-procedures.md` + `docs/qa/index.md`. Execute QA-001 and QA-002 twice each (any qualified mode), promote them Draft → Active with evidence in `docs/qa/assets/`, then file the backlog procedures (sign-up/first-run, error/404/loading, mobile sweep, a11y sweep, account-deletion-with-disposable-account, …) as they're needed by real PRs. Wire the per-PR "touched-surface procedure + screenshots" habit into review expectations.

## Verification

- [ ] Part 1: `scripts/crap-report.ts` + colocated test landed; baseline top-25 recorded below; hotspot table reconciled
- [ ] Part 2: pilot baseline scores recorded below; zero un-triaged survivors in pilot modules; weekly workflow live
- [ ] Part 3: driver + features #1/#4 landed with spec-sync verified (rename-a-step fails); revenue features #2/#3/#10 landed; location tables updated
- [ ] Part 4: QA-001 and QA-002 Active with evidence; operator-checklist item 8 references the register
- [ ] Standing: no numeric gate introduced anywhere without a new ADR (ADR-019 Compliance)

### Baselines (fill on first runs — no invented numbers)

| Measure | Date | Result |
|---|---|---|
| CRAP top-25 snapshot | — | — |
| Mutation pilot scores | — | — |

## Related

- [ADR-019](../adr/adr-019-test-quality-practices.md) (decision + observational posture), [ADR-003](../adr/adr-003-testing-strategy.md) (base strategy)
- Runbooks: [`docs/dev/code-quality-metrics.md`](../dev/code-quality-metrics.md), [`docs/dev/mutation-testing.md`](../dev/mutation-testing.md), [`docs/dev/acceptance-testing.md`](../dev/acceptance-testing.md), [`docs/dev/qa-procedures.md`](../dev/qa-procedures.md)
- Register: [`docs/qa/index.md`](../qa/index.md) (QA-001, QA-002)
- Constraints honored: coverage-as-observational (`docs/dev/react-vitest-testing.md`), DEBT-460 dual-compiler seam, DEBT-323 toggle-interaction limits, `docs/dev/stabilization-checklist.md` (absorbed by QA-001 once Active)
