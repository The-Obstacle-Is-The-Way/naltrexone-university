# Developer Docs Index

**Last Updated:** 2026-06-13

Use this index to route to the right developer runbook. Universal agent rules and required push gates remain canonical in [`AGENTS.md`](../../AGENTS.md).

## Testing

- [React 19 + Vitest Testing](./react-vitest-testing.md) — component/unit harness choices, jsdom directive, Browser Mode split, and coverage-as-observational policy.
- [Testing Infrastructure](./testing-infrastructure.md) — Playwright, local E2E, authenticated E2E credentials, Docker-backed local database flow.
- [Integration Tests](./integration-tests.md) — local Postgres setup and integration-suite expectations.

## Deployment And Operations

- [Deployment Procedure](./deployment-procedure.md) — release checklist and deploy-time database migration cautions.
- [Deployment Environments](./deployment-environments.md) — environment layout, deploy targets, and known environment failure modes.
- [Database Rollbacks](./database-rollbacks.md) — rollback constraints and database recovery guidance.
- [Logging](./logging.md) — logging conventions and operational diagnostics.
- [Stabilization Checklist](./stabilization-checklist.md) — pre-release stabilization checks.

## Supply Chain And Dependencies

- [Dependency Update Protocol](./dependency-update-protocol.md) — how to review and land dependency updates.
- [Supply Chain Overrides](./supply-chain-overrides.md) — pnpm trust/maturity settings and override policy.
- [License Baseline](./license-baseline.md) — dependency license inventory baseline.

## Content And Analytics

- [Question Content Pipeline](./question-content-pipeline.md) — content authoring/import flow.
- [Question Feedback Analytics](./question-feedback-analytics.md) — feedback export and analytics workflow.
