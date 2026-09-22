# Master Spec — Part 1: Overview, Architecture & Database Schema

**2026-09-22 — navigation view.** [DEBT-481](../_archive/debt/debt-481-master-spec-implementation-drift.md) replaces the independently maintained implementation copy with links to the master and each contract's authority. Product decisions remain in the master; this page adds no separate contract.

## Read this part

- [System overview](./master_spec.md#1-system-overview)
- [Architecture diagram](./master_spec.md#2-architecture-diagram)
- [Database schema authority](./master_spec.md#3-database-schema)

## Implementation authority

Physical schema: [db/schema.ts](../../db/schema.ts) and [migration ledger](../../db/migrations/meta/_journal.json).

## Other parts

- [Part 2: API & Server Actions](./master_spec_part2.md)
- [Part 3: Content Pipeline, Directory Structure & Vertical Slices](./master_spec_part3.md)
- [Part 4: Testing, Security, Environment & Deployment](./master_spec_part4.md)

- [Full master specification](./master_spec.md)

## Historical warning

> **Updated: 2026-09-20 — current-contract warning.** The [DEBT-481 audit](../_archive/debt/debt-481-master-spec-implementation-drift.md) confirms stale schema, action/limit, content/seed, CI and timing examples across the master/split copies. Do not copy these “exact” blocks as current implementation authority. Follow the linked source/runtime contracts and current [SPEC-016](../_archive/specs/spec-016-observability.md) and [SPEC-017](../_archive/specs/spec-017-rate-limiting.md) while documentation ownership is reconciled; product decisions are not superseded by this warning.

The September 22 reconciliation above supersedes that warning for the six confirmed contracts. The prior copied implementation is retained in Git history, not as live guidance.
