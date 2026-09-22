# Master Spec — Part 4: Testing, Security, Environment & Deployment

**2026-09-22 — navigation view.** [DEBT-481](../_archive/debt/debt-481-master-spec-implementation-drift.md) replaces the independently maintained implementation copy with links to the master and each contract's authority. Product decisions remain in the master; this page adds no separate contract.

## Read this part

- [Testing strategy](./master_spec.md#8-testing-strategy)
- [CI authority and release ordering](./master_spec.md#84-ci-pipeline-github-actions)
- [Security checklist](./master_spec.md#9-security-checklist-mandatory)
- [Environment variables](./master_spec.md#10-environment-variables)
- [Stripe setup](./master_spec.md#11-stripe-setup)
- [Deployment checklist](./master_spec.md#12-deployment-checklist-ordered)
- [Product exclusions and timing](./master_spec.md#13-out-of-scope-for-mvp-explicit)

## Implementation authority

Use [AGENTS.md](../../AGENTS.md#the-rule) for the local gate, the [CI workflow](../../.github/workflows/ci.yml) for executable CI, and the [deployment procedure](../dev/deployment-procedure.md) for the production gate and receipts. Toolchain versions and secret scope must not be copied into a second YAML recipe.

## Other parts

- [Part 1: Overview, Architecture & Database Schema](./master_spec_part1.md)
- [Part 2: API & Server Actions](./master_spec_part2.md)
- [Part 3: Content Pipeline, Directory Structure & Vertical Slices](./master_spec_part3.md)

- [Full master specification](./master_spec.md)

## Historical warning

> **Updated: 2026-09-20 — current-contract warning.** The [DEBT-481 audit](../_archive/debt/debt-481-master-spec-implementation-drift.md) confirms stale schema, action/limit, content/seed, CI and timing examples across the master/split copies. Do not copy these “exact” blocks as current implementation authority. Follow the linked source/runtime contracts and current [SPEC-016](../_archive/specs/spec-016-observability.md) and [SPEC-017](../_archive/specs/spec-017-rate-limiting.md) while documentation ownership is reconciled; product decisions are not superseded by this warning.

The September 22 reconciliation above supersedes that warning for the six confirmed contracts. The prior copied implementation is retained in Git history, not as live guidance.
