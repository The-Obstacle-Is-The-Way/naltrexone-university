# Master Spec — Part 2: API & Server Actions

**2026-09-22 — navigation view.** [DEBT-481](../_archive/debt/debt-481-master-spec-implementation-drift.md) replaces the independently maintained implementation copy with links to the master and each contract's authority. Product decisions remain in the master; this page adds no separate contract.

## Read this part

- [Auth levels](./master_spec.md#41-auth-level-definitions)
- [Subscription entitlement](./master_spec.md#42-subscription-entitlement-design-summary)
- [Action results](./master_spec.md#43-standard-server-action-result-type-used-by-every-server-action)
- [Route handlers](./master_spec.md#44-route-handlers-api-endpoints)
- [Server actions](./master_spec.md#45-server-actions-required)
- [Idempotency and rate limits](./master_spec.md#450-cross-cutting-controller-policies-required)
- [Explicit bookmark state](./master_spec.md#459-server-action-setbookmarkquestionid-bookmarked)

## Implementation authority

Current controller exports and schemas live in [src/adapters/controllers](../../src/adapters/controllers/). [SPEC-017](../_archive/specs/spec-017-rate-limiting.md#current-state) owns the audited limit inventory. Action count, limited-operation count and policy count are different concepts. This page does not claim to enumerate all actions.

## Other parts

- [Part 1: Overview, Architecture & Database Schema](./master_spec_part1.md)
- [Part 3: Content Pipeline, Directory Structure & Vertical Slices](./master_spec_part3.md)
- [Part 4: Testing, Security, Environment & Deployment](./master_spec_part4.md)

- [Full master specification](./master_spec.md)

## Historical warning

> **Updated: 2026-09-20 — current-contract warning.** The [DEBT-481 audit](../_archive/debt/debt-481-master-spec-implementation-drift.md) confirms stale schema, action/limit, content/seed, CI and timing examples across the master/split copies. Do not copy these “exact” blocks as current implementation authority. Follow the linked source/runtime contracts and current [SPEC-016](../_archive/specs/spec-016-observability.md) and [SPEC-017](../_archive/specs/spec-017-rate-limiting.md) while documentation ownership is reconciled; product decisions are not superseded by this warning.

The September 22 reconciliation above supersedes that warning for the six confirmed contracts. The prior copied implementation is retained in Git history, not as live guidance.
