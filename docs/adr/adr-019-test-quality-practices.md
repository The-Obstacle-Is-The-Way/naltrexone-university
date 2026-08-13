# ADR-019: Test Quality Practices (CRAP, Mutation, Acceptance, UI QA)

**Status:** Proposed
**Date:** 2026-08-13
**Decision Makers:** Owner
**Depends On:** ADR-003 (Testing Strategy), ADR-001 (Clean Architecture Layers)

---

## Context

The suite ADR-003 defined is mature: 556 test files (~151k lines) across four lanes (unit, browser, integration, E2E), a hard TDD mandate, fakes-over-mocks with a complete fakes barrel, and design-system regression scans. What it does **not** yet have are the practices that audit and specify that suite from the outside — the gaps become visible precisely because most code and tests here are agent-written:

1. **Nothing measures whether the tests actually constrain behavior.** Coverage says lines ran; it cannot say a mutated `<=` would be caught. The audit found both consequential thin spots (`grading.ts` — the product's core correctness function — carries 5 tests) and consequence concentrations whose bite nothing audits (`subscription-write-guard.ts`, which decides whether a paying customer's subscription can be overwritten, carries 21 table-driven cases that have never been adversarially checked).
2. **Nothing ranks under-tested complexity.** Triage of "where do tests or refactors pay off next" is currently manual sweeps.
3. **Business rules have no UI-independent executable specification.** Rules live in use cases and their unit tests; nothing states them in business language, so nothing structurally prevents a rule from migrating into a component during agent iteration.
4. **UI verification is tribal.** Manual flow scripts exist inside `docs/dev/stabilization-checklist.md`, the operator checklist demands smoke tests that are written nowhere, and an audit found a long list of surfaces with zero UI-level automation — enumerated in `docs/dev/qa-procedures.md` (rendered auth forms, error boundaries, billing portal round-trip, entitlement redirect gate, any mobile viewport…).

Standing constraint honored throughout: **coverage numbers are observational in this repo** (`docs/dev/react-vitest-testing.md`) — TDD discipline and behavior assertions are the enforcement mechanism, not numeric gates.

## Decision

Adopt four practices, each with a canonical runbook, tracked as DEBT-465 (one part each):

1. **CRAP analysis** — a repo-built `scripts/crap-report.ts` ranks every function by `comp² × (1 − cov)³ + comp` using existing coverage output and the TypeScript compiler API. Ranked triage only. Runbook: `docs/dev/code-quality-metrics.md`.
2. **Mutation testing** — StrykerJS with the Vitest runner, scoped to the unit lane (`vitest.config.ts`) and to pure domain/application modules, incremental mode, weekly scheduled CI + on-demand local runs. Runbook: `docs/dev/mutation-testing.md`.
3. **Gherkin acceptance tests** — real `.feature` files bound via `@amiceli/vitest-cucumber` to an application-layer driver built on the existing fakes; bindings named `*.acceptance.test.ts` under `tests/acceptance/` so they run inside the existing unit lane with zero runner changes. New business rules ship their feature file first (the outer TDD loop). Runbook: `docs/dev/acceptance-testing.md`.
4. **UI QA procedures** — a `docs/qa/` register (QA-NNN, same mechanics as the debt/bug registers) of scripted, evidence-producing procedures executable by humans, agents (within the DEBT-323 constraint table), or Playwright-assisted runs; stable procedures get promoted into `tests/e2e/`. Runbook: `docs/dev/qa-procedures.md`.

**Metric posture (binding):** mutation scores and CRAP scores enter as *observational ratchets* — reports never fail a build (`break: null`; exit 0). Converting any of them into a gate requires a new ADR that amends this one with measured baselines. This deliberately extends the existing coverage-observational policy rather than overriding it.

**Sequencing rationale:** Part 1 (CRAP) first — cheapest, produces the map; Part 2 (mutation pilot) second — audits the existing suites where consequence is highest; Part 3 (acceptance) third — the largest ongoing discipline change; Part 4 (QA register) is bootstrapped already (QA-001/QA-002 drafts) and grows per-surface.

## Consequences

### Positive

- Test strength becomes measurable and triage becomes ranked, without importing threshold culture.
- Business rules gain UI-independent, human-readable, drift-detected specifications — the specific guard against agents blending UI and business logic.
- The "works at the API, broken at the UI" class of delivery gets a named, executable catch.
- All four practices reuse the existing stack (Vitest 4, fakes, TS compiler API, register conventions); no second test runner, no framework migration.

### Negative

- Four new devDependencies (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@amiceli/vitest-cucumber`, `istanbul-lib-coverage`).
- Mutation runs cost minutes; acceptance features cost authoring discipline; QA procedures cost execution time per release.
- Metric visibility invites metric-chasing (suppression spam, equivalent-mutant hunting to 100%).

### Mitigations

- Observational posture is binding (above); suppressions require stated reasons; per-module ratchets, not global targets.
- Mutation CI is a separate weekly workflow, never in the PR path initially; incremental mode bounds local cost.
- `@stryker-mutator/typescript-checker` is explicitly deferred — it would peer-resolve the repo's `typescript` alias (`@typescript/typescript6`, the DEBT-460 dual-compiler seam).
- QA procedures declare execution modes honestly (toggle interactions are Playwright-or-human per DEBT-323) so agent runs can't silently skip steps.

## Compliance

- DEBT-465 carries per-part Verification checklists (baselines recorded there: first CRAP top-25, first mutation scores, first two features landed, QA-001/002 first Active runs).
- The four runbooks are canonical; `docs/dev/index.md` routes to them; the Test Locations tables (`AGENTS.md`, `.claude/rules/testing.md`) gain the `tests/acceptance/` row in the PR that lands the first feature.
- No numeric quality gate may be added to CI or configs without a new ADR referencing this section.
- Standard PR review (CodeRabbit mandatory) applies to every adoption PR.

## References

- Alberto Savoia & Bob Evans — the CRAP metric / crap4j
- StrykerJS documentation — Vitest runner, incremental mode, disable directives
- `@amiceli/vitest-cucumber` — Gherkin for Vitest 4
- Dave Farley — four-layer acceptance-test model (spec → DSL → driver → SUT)
- Robert C. Martin — TDD, Clean Code, and Clean Architecture
- ADR-003 (Testing Strategy); `docs/dev/react-vitest-testing.md` (coverage-as-observational policy)
