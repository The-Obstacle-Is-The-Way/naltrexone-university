# Technical Debt Register

**Project:** Naltrexone University
**Last Updated:** 2026-02-01

---

## What is Technical Debt?

Technical debt documents known shortcuts, deferred work, and architectural compromises. They serve as:

1. **Visibility** — Make implicit debt explicit
2. **Prioritization** — Help decide what to tackle and when
3. **Tracking** — Ensure debt is paid down over time

## Debt Index (Active)

| ID | Title | Status | Priority | Date |
|----|-------|--------|----------|------|
| [DEBT-034](./debt-034-test-coverage-gap-critical.md) | **Test Coverage Gap — BLOCK NEW FEATURES** | Open | **P0** | 2026-02-01 |
| [DEBT-025](./debt-025-untested-stripe-event-repository.md) | Untested Stripe Event Repository | Open | P1 | 2026-02-01 |
| [DEBT-026](./debt-026-duplicated-db-type-definition.md) | Duplicated Db Type Definition | Open | P2 | 2026-02-01 |
| [DEBT-027](./debt-027-repositories-hardcode-new-date.md) | Repositories Hardcode new Date() | Open | P2 | 2026-02-01 |
| [DEBT-028](./debt-028-clerk-auth-gateway-srp-violation.md) | ClerkAuthGateway SRP Violation | Open | P2 | 2026-02-01 |
| [DEBT-029](./debt-029-untested-stripe-prices-config.md) | Untested Stripe Prices Config | Open | P2 | 2026-02-01 |
| [DEBT-030](./debt-030-untested-tag-repository.md) | Untested Tag Repository | Open | P2 | 2026-02-01 |
| [DEBT-031](./debt-031-stripe-payment-gateway-unknown-args.md) | StripePaymentGateway unknown[] Args | Open | P2 | 2026-02-01 |
| [DEBT-032](./debt-032-incomplete-composition-root.md) | Incomplete Composition Root | Open | P3 | 2026-02-01 |
| [DEBT-033](./debt-033-flat-repository-structure.md) | Flat Repository Structure | Open | P3 | 2026-02-01 |

**Next Debt ID:** DEBT-035

## Archived Debt

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-001](../_archive/debt/debt-001-foundation-drift-vs-spec.md) | Foundation Drift vs SSOT | P2 | 2026-02-01 |
| [DEBT-002](../_archive/debt/debt-002-missing-integration-tests.md) | Missing Integration Tests | P2 | 2026-01-31 |
| [DEBT-003](../_archive/debt/debt-003-missing-subscription-update-method.md) | SubscriptionRepository Missing update() | P1 | 2026-01-31 |
| [DEBT-004](../_archive/debt/debt-004-magic-numbers-practice-session-validation.md) | Magic Numbers in Validation | P3 | 2026-01-31 |
| [DEBT-005](../_archive/debt/debt-005-gateway-adapters-missing.md) | Gateway Adapters Missing | P1 | 2026-01-31 |
| [DEBT-006](../_archive/debt/debt-006-grading-service-spec-drift.md) | Grading Service Spec Drift | P1 | 2026-01-31 |
| [DEBT-007](../_archive/debt/debt-007-fake-repos-no-validation.md) | Fake Repos No Validation | P3 | 2026-01-31 |
| [DEBT-008](../_archive/debt/debt-008-duplicated-validation-logic.md) | Duplicated Validation Logic | P2 | 2026-01-31 |
| [DEBT-009](../_archive/debt/debt-009-duplicated-choice-mapping.md) | Duplicated Choice Mapping | P2 | 2026-01-31 |
| [DEBT-010](../_archive/debt/debt-010-trivial-entity-tests.md) | Trivial Entity Tests | P1 | 2026-01-31 |
| [DEBT-011](../_archive/debt/debt-011-get-next-question-srp-violation.md) | GetNextQuestion SRP Violation | P2 | 2026-01-31 |
| [DEBT-012](../_archive/debt/debt-012-validation-in-wrong-layer.md) | Validation in Wrong Layer | P2 | 2026-01-31 |
| [DEBT-013](../_archive/debt/debt-013-time-spent-tracking-post-mvp.md) | Time Spent Tracking Deferred | P3 | 2026-02-01 |
| [DEBT-014](../_archive/debt/debt-014-lib-throws-plain-error.md) | lib/ Throws Plain Error | P2 | 2026-02-01 |
| [DEBT-015](../_archive/debt/debt-015-stripe-customer-race-condition.md) | Stripe Customer Fallback Logic | P3 | 2026-02-01 |
| [DEBT-016](../_archive/debt/debt-016-duplicated-upsert-pattern.md) | Duplicated Upsert Pattern | P2 | 2026-02-01 |
| [DEBT-017](../_archive/debt/debt-017-undocumented-stripe-customer-constraint.md) | Undocumented Stripe Constraint | P3 | 2026-02-01 |
| [DEBT-018](../_archive/debt/debt-018-missing-error-boundaries.md) | Missing Error Boundaries | P2 | 2026-02-01 |
| [DEBT-019](../_archive/debt/debt-019-stripe-events-idempotency-port-mismatch.md) | Stripe Events Idempotency Port | P1 | 2026-02-01 |
| [DEBT-020](../_archive/debt/debt-020-duplicate-postgres-unique-violation-helper.md) | Duplicate Unique-Violation Helper | P4 | 2026-02-01 |
| [DEBT-021](../_archive/debt/debt-021-duplicate-choice-ordering.md) | Duplicate Choice Ordering | P4 | 2026-02-01 |
| [DEBT-022](../_archive/debt/debt-022-attempt-selected-choice-nullability.md) | Attempt Nullability Mismatch | P2 | 2026-02-01 |
| [DEBT-023](../_archive/debt/debt-023-unused-lib-subscription.md) | Unused lib/subscription.ts | P3 | 2026-02-01 |
| [DEBT-024](../_archive/debt/debt-024-shuffle-seed-spec-drift.md) | Shuffle Seed Spec Drift | P2 | 2026-02-01 |

## Debt Statuses

- **Open** — Debt acknowledged, not yet addressed
- **In Progress** — Actively being paid down
- **Resolved** — Debt paid, verified
- **Accepted** — Intentionally kept (with justification)

## Priority Levels

- **P0** — Critical: Blocks development or production
- **P1** — High: Significant impact on velocity or quality
- **P2** — Medium: Noticeable friction, should address soon
- **P3** — Low: Minor inconvenience
- **P4** — Trivial: Nice to clean up

---

## How to Document New Debt

1. Create `debt-NNN-short-description.md` using the template below
2. Set status to "Open"
3. Assign priority based on impact
4. Submit PR for review

## Debt Template

```markdown
# DEBT-NNN: Short Title

**Status:** Open | In Progress | Resolved | Accepted
**Priority:** P0 | P1 | P2 | P3 | P4
**Date:** YYYY-MM-DD

---

## Description

What is the debt? Why does it exist?

## Impact

How does this affect development, quality, or users?

## Resolution

What needs to be done to pay down this debt?

## Verification

How will we verify the debt is resolved?

## Related

- Links to code, specs, ADRs
```

---

## Archive

Resolved debt is archived to `docs/_archive/debt/` after verification.
