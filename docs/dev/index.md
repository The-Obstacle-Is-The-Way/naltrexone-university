# Developer Docs Index

**Last Updated:** 2026-09-22 (navigation maintenance; linked runbooks retain their own verification dates)

Use this index to route to the right developer runbook. Universal agent rules and required push gates remain canonical in [`AGENTS.md`](../../AGENTS.md).

## Testing

- [React 19 + Vitest Testing](../guides/testing/react-component-tests.md) — component/unit harness choices, jsdom directive, Browser Mode split, and coverage-as-observational policy.
- [Testing Infrastructure](../guides/testing/e2e-tests.md) — Playwright, local E2E, authenticated E2E credentials, Docker-backed local database flow.
- [Integration Tests](../guides/testing/integration-tests.md) — local Postgres setup and integration-suite expectations.
- [Business Rules and Their Tests](../product/business-rules.md): the rule-to-test register. Each business rule is stated in plain language with the tests that prove it, and `tests/rule-to-test-register.test.ts` checks every link on each test run. It replaces the Gherkin harness, which was not adopted on 2026-10-03 (ADR-019 / DEBT-465 Part 3).
- [Mutation Testing (StrykerJS)](../guides/testing/mutation-testing.md) — Stryker vitest-runner setup, unit-lane scope policy, pilot targets, survivor triage, weekly CI cadence. (ADR-019 / DEBT-465 Part 2)
- [Code Quality Metrics (CRAP)](../guides/testing/crap-report.md) — the `crap-report` script over merged coverage, observational interpretation policy, a-priori hotspots. (ADR-019 / DEBT-465 Part 1)
- [UI QA Procedures](../guides/qa/method.md) — method for [the QA procedures](../guides/qa/README.md): execution modes and agent constraints, environments, evidence, promotion to Playwright. (ADR-019 / DEBT-465 Part 4)

## Deployment And Operations

- [Deployment Procedure](../guides/release/promote-to-production.md) — release checklist and deploy-time database migration cautions.
- [Deployment Environments](../architecture/environments.md) — environment layout, deploy targets, and known environment failure modes.
- [Migration Authoring](../guides/database/migrations.md) — pre-flight proof, cleanup audit trails, ordering, and lock-scope rules for Drizzle migrations.
- [Database Rollbacks](../guides/operations/database-recovery.md) — rollback constraints and database recovery guidance.
- [Logging](../architecture/observability.md) — logging conventions and operational diagnostics.
- [Stabilization Checklist](./stabilization-checklist.md) — pre-release stabilization checks.

## Supply Chain And Dependencies

- [Dependency Update Protocol](../guides/dependencies/updating-dependencies.md) — how to review and land dependency updates.
- [Supply Chain Overrides](../policies/supply-chain.md) — pnpm trust/maturity settings and override policy.
- [License Baseline](./license-baseline.md) — dependency license inventory baseline.

## Content And Analytics

- [Question Content Pipeline](../architecture/content-pipeline.md) — canonical content authoring/import flow.
- [Question Feedback Analytics](../guides/content/feedback-export.md) — feedback export and analytics workflow.

## Legal And Security References

- [Terms of Service publication copy](../legal/terms-of-service.md) — versioned legal copy; implementation and owner-review limits are recorded in DEBT-414.
- [Information Security Program](../security/information-security-program.md) — adopted program, evidence scope and operational exceptions.
