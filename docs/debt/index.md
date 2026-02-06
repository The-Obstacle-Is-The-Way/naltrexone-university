# Technical Debt Register

**Project:** Naltrexone University
**Last Updated:** 2026-02-06

---

## What is Technical Debt?

Technical debt documents known shortcuts, deferred work, and architectural compromises. They serve as:

1. **Visibility** — Make implicit debt explicit
2. **Prioritization** — Help decide what to tackle and when
3. **Tracking** — Ensure debt is paid down over time

## Debt Index (Active)

| ID | Title | Status | Priority | Date |
|----|-------|--------|----------|------|
| [DEBT-113](debt-113-dashboard-review-lack-session-context.md) | Dashboard and Review Pages Lack Session Context | Open | P1 | 2026-02-06 |
| [DEBT-114](debt-114-no-session-history-page.md) | No Session History Page | Open | P2 | 2026-02-06 |
| [DEBT-115](debt-115-practice-page-god-component.md) | Practice Page God Component (823 Lines) | Open | P1 | 2026-02-06 |
| [DEBT-116](debt-116-session-page-god-component.md) | Session Page Client God Component (668 Lines) | Open | P1 | 2026-02-06 |
| [DEBT-117](debt-117-choice-shuffling-dry-violation.md) | Choice Shuffling Logic Duplicated Across Use Cases | Open | P2 | 2026-02-06 |
| [DEBT-118](debt-118-graceful-degradation-dry-violation.md) | Graceful Degradation Pattern Duplicated in 3 Use Cases | Open | P3 | 2026-02-06 |
| [DEBT-119](debt-119-ports-file-god-module.md) | Ports File Is a God Module (352 Lines, 10+ Interfaces) | Open | P3 | 2026-02-06 |
| [DEBT-120](debt-120-composition-root-growing.md) | Composition Root Growing Toward God File (407 Lines) | Open | P3 | 2026-02-06 |
| [DEBT-121](debt-121-use-case-fakes-lack-interfaces.md) | Use Case Fakes Don't Implement Interfaces (No Compile-Time Safety) | Open | P2 | 2026-02-06 |

**Next Debt ID:** DEBT-122

## Archived Debt

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-112](../_archive/debt/debt-112-raw-slugs-exposed-in-ui.md) | Raw Content-Pipeline Slugs Exposed to Users in Dashboard, Review, and Bookmarks | P1 | 2026-02-06 |
| [DEBT-106](../_archive/debt/debt-106-exam-mode-mark-for-review.md) | Exam Mode Missing "Mark for Review" Feature | P2 | 2026-02-06 |
| [DEBT-111](../_archive/debt/debt-111-explanation-choice-label-mismatch.md) | Explanation Text References Original Choice Labels After Shuffle | P0 | 2026-02-06 |
| [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) | E2E Test Helper Anti-Patterns (isVisible Timeout + Stripe Duplication) | P3 | 2026-02-05 |
| [DEBT-107](../_archive/debt/debt-107-question-engine-e2e-completeness.md) | Question Engine E2E Completeness and State Management (Accepted) | P1 | 2026-02-06 |
| [DEBT-105](../_archive/debt/debt-105-missing-session-resume-functionality.md) | Missing Session Resume Functionality | P2 | 2026-02-06 |
| [DEBT-104](../_archive/debt/debt-104-missing-e2e-test-credentials.md) | Missing E2E Test Credentials for Authenticated Flows (Accepted) | P1 | 2026-02-06 |
| [DEBT-109](../_archive/debt/debt-109-inline-vi-fn-logger-mocks.md) | Inline vi.fn() Logger Mocks Violate Fakes-Over-Mocks Rule | P2 | 2026-02-05 |
| [DEBT-108](../_archive/debt/debt-108-hardcoded-zinc-colors-break-light-dark-toggle.md) | Hardcoded Zinc Colors Break Light/Dark Mode Toggle | P2 | 2026-02-05 |
| [DEBT-103](../_archive/debt/debt-103-nextjs-scroll-behavior-warning.md) | Next.js Scroll Behavior Warning | P4 | 2026-02-05 |
| [DEBT-100](../_archive/debt/debt-100-adversarial-audit-2026-02-04.md) | Adversarial Codebase Audit Backlog (2026-02-04) | P0 | 2026-02-05 |
| [DEBT-101](../_archive/debt/debt-101-add-sentry-error-tracking.md) | Add Sentry Error Tracking (Next.js, Free Tier) | P1 | 2026-02-05 |
| [DEBT-102](../_archive/debt/debt-102-question-content-pipeline-hardening.md) | Question Content Pipeline Hardening (Tags, Publishing, and Prod Seeding) | P2 | 2026-02-05 |
| [DEBT-084](../_archive/debt/debt-084-user-email-race-condition.md) | User Email Race Condition in Concurrent Webhook Handling | P3 | 2026-02-04 |
| [DEBT-090](../_archive/debt/debt-090-missing-use-cases-business-logic-in-controllers.md) | Missing Application Use Cases (Business Logic Lives in Controllers) | P1 | 2026-02-04 |
| [DEBT-096](../_archive/debt/debt-096-repository-mapper-duplication.md) | Repository Row→Domain Mapping Duplicated (DRY Violation) | P3 | 2026-02-04 |
| [DEBT-099](../_archive/debt/debt-099-interactive-ui-tests-missing.md) | Interactive UI Tests Missing — Client Components Had Zero Interaction Coverage | P1 | 2026-02-04 |
| [DEBT-092](../_archive/debt/debt-092-stripe-payment-gateway-god-class.md) | StripePaymentGateway is a God Class (SRP + Separation Pressure) | P2 | 2026-02-04 |
| [DEBT-091](../_archive/debt/debt-091-attempt-repository-isp-violation.md) | AttemptRepository is “Fat” (Interface Segregation Pressure) | P3 | 2026-02-04 |
| [DEBT-098](../_archive/debt/debt-098-clerk-ui-theming-incomplete.md) | Clerk UI Components Not Fully Themed for Achromatic Dark Mode | P2 | 2026-02-04 |
| [DEBT-097](../_archive/debt/debt-097-v0-premium-ui-components-not-integrated.md) | V0 Premium Landing Page Components Deleted Instead of Integrated | P2 | 2026-02-04 |
| [DEBT-093](../_archive/debt/debt-093-clerk-webhook-route-business-logic.md) | Clerk Webhook Route Contains Business Logic (Framework Layer Leakage) | P2 | 2026-02-04 |
| [DEBT-094](../_archive/debt/debt-094-inline-server-action-billing-page.md) | Inline Server Action Inside Billing Page (Inconsistent Pattern) | P3 | 2026-02-04 |
| [DEBT-095](../_archive/debt/debt-095-console-error-in-production.md) | console.error Usage in Production Code (Bypasses Structured Logger) | P3 | 2026-02-04 |
| [DEBT-089](../_archive/debt/debt-089-logger-port-wrong-layer.md) | Logger Port Defined in Wrong Layer (Dependency Arrow Outward) | P2 | 2026-02-04 |
| [DEBT-088](../_archive/debt/debt-088-optional-logger-hides-errors.md) | Optional Logger Pattern Hides Errors | P2 | 2026-02-03 |
| [DEBT-087](../_archive/debt/debt-087-graceful-degradation-hides-data-loss.md) | Graceful Degradation Hides Data Loss from Users | P2 | 2026-02-03 |
| [DEBT-086](../_archive/debt/debt-086-dry-violation-controller-boilerplate.md) | DRY Violation — Repeated Controller Boilerplate Pattern | P3 | 2026-02-03 |
| [DEBT-085](../_archive/debt/debt-085-union-return-type-code-smell.md) | Union Return Type Pattern in requireEntitledUserId() | P3 | 2026-02-03 |
| [DEBT-083](../_archive/debt/debt-083-unused-attempt-repository-find-by-user-id.md) | AttemptRepository.findByUserId() Needs Pagination | P2 | 2026-02-03 |
| [DEBT-082](../_archive/debt/debt-082-test-logs-too-noisy.md) | Unit Tests Emit Noisy Error Logs | P3 | 2026-02-03 |
| [DEBT-081](../_archive/debt/debt-081-nextjs-alloweddevorigins-warning.md) | Next.js allowedDevOrigins Warning in E2E Runs | P3 | 2026-02-03 |
| [DEBT-080](../_archive/debt/debt-080-missing-e2e-coverage-core-pages.md) | Missing E2E Coverage for Core App Pages | P1 | 2026-02-03 |
| [DEBT-074](../_archive/debt/debt-074-missing-boundary-integration-tests.md) | Missing Boundary Integration Tests (Uncle Bob's "Humble Object" Gap) | P1 | 2026-02-02 |
| [DEBT-079](../_archive/debt/debt-079-no-retry-backoff-external-calls.md) | No Retry/Backoff Logic for External API Calls | P2 | 2026-02-02 |
| [DEBT-078](../_archive/debt/debt-078-no-idempotency-keys.md) | No Idempotency Keys on State-Changing Actions | P1 | 2026-02-02 |
| [DEBT-077](../_archive/debt/debt-077-no-rate-limiting.md) | No Rate Limiting on Webhooks or Actions | P1 | 2026-02-02 |
| [DEBT-076](../_archive/debt/debt-076-no-webhook-input-validation.md) | No Schema Validation on Webhook Payloads | P1 | 2026-02-02 |
| [DEBT-075](../_archive/debt/debt-075-no-vcr-cassettes-external-apis.md) | No VCR/Cassette Pattern for External API Testing | P1 | 2026-02-02 |
| [DEBT-073](../_archive/debt/debt-073-pricing-page-shows-subscribe-to-subscribers.md) | Pricing Page Shows Subscribe Buttons to Already-Subscribed Users | P2 | 2026-02-02 |
| [DEBT-072](../_archive/debt/debt-072-drizzle-subquery-join-pattern.md) | Drizzle Subquery Join Pattern Causes Ambiguous Columns | P2 | 2026-02-02 |
| [DEBT-071](../_archive/debt/debt-071-missing-why-comments.md) | Missing WHY Comments on Non-Obvious Business Logic | P3 | 2026-02-02 |
| [DEBT-060](../_archive/debt/debt-060-no-rollback-migrations.md) | No Rollback Migrations | P2 | 2026-02-02 |
| [DEBT-061](../_archive/debt/debt-061-timezone-not-explicitly-enforced.md) | Timezone Not Explicitly Enforced at Application Level | P3 | 2026-02-02 |
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
| [DEBT-025](../_archive/debt/debt-025-untested-stripe-event-repository.md) | Untested Stripe Event Repository | P1 | 2026-02-01 |
| [DEBT-026](../_archive/debt/debt-026-duplicated-db-type-definition.md) | Duplicated Db Type Definition | P2 | 2026-02-01 |
| [DEBT-027](../_archive/debt/debt-027-repositories-hardcode-new-date.md) | Repositories Hardcode new Date() | P2 | 2026-02-01 |
| [DEBT-028](../_archive/debt/debt-028-clerk-auth-gateway-srp-violation.md) | ClerkAuthGateway SRP Violation | P2 | 2026-02-01 |
| [DEBT-029](../_archive/debt/debt-029-untested-stripe-prices-config.md) | Untested Stripe Prices Config | P2 | 2026-02-01 |
| [DEBT-030](../_archive/debt/debt-030-untested-tag-repository.md) | Untested Tag Repository | P2 | 2026-02-01 |
| [DEBT-031](../_archive/debt/debt-031-stripe-payment-gateway-unknown-args.md) | StripePaymentGateway unknown[] Args | P2 | 2026-02-01 |
| [DEBT-032](../_archive/debt/debt-032-incomplete-composition-root.md) | Incomplete Composition Root | P3 | 2026-02-01 |
| [DEBT-033](../_archive/debt/debt-033-flat-repository-structure.md) | Flat Repository Structure | P3 | 2026-02-01 |
| [DEBT-034](../_archive/debt/debt-034-test-coverage-gap-critical.md) | Test Coverage Gap — Must Stabilize Before New Features | P1 | 2026-02-01 |
| [DEBT-035](../_archive/debt/debt-035-inconsistent-repo-test-mocking.md) | Inconsistent Repo Test Mocking (False Positive) | P2 | 2026-02-01 |
| [DEBT-036](../_archive/debt/debt-036-specs-register-and-ports-doc-drift.md) | Specs Register and Ports Docs Drift | P2 | 2026-02-01 |
| [DEBT-037](../_archive/debt/debt-037-attempt-repo-unnecessary-null-checks.md) | Unnecessary Null Checks in Attempt Repository | P3 | 2026-02-02 |
| [DEBT-038](../_archive/debt/debt-038-question-repo-type-assertion.md) | Misleading Type Assertion in Question Repository | P3 | 2026-02-02 |
| [DEBT-039](../_archive/debt/debt-039-webhook-error-context-loss.md) | Error Context Loss in Stripe Webhook Failures | P2 | 2026-02-02 |
| [DEBT-040](../_archive/debt/debt-040-missing-session-id-index.md) | Missing Standalone Index on Attempts by Session | P2 | 2026-02-02 |
| [DEBT-041](../_archive/debt/debt-041-skip-clerk-production-safety.md) | SKIP_CLERK Production Safety Gap | P2 | 2026-02-02 |
| [DEBT-042](../_archive/debt/debt-042-stripe-customer-concurrent-upsert.md) | Race Condition in Stripe Customer Concurrent Upsert | P3 | 2026-02-02 |
| [DEBT-043](../_archive/debt/debt-043-unused-schema-wildcard-import.md) | Unused Schema Wildcard Import | P4 | 2026-02-02 |
| [DEBT-044](../_archive/debt/debt-044-spec-005-status-drift.md) | SPEC-005 Status Incorrectly Marked as Implemented | P2 | 2026-02-02 |
| [DEBT-045](../_archive/debt/debt-045-claude-md-documentation-drift.md) | CLAUDE.md Documentation Drift | P2 | 2026-02-02 |
| [DEBT-046](../_archive/debt/debt-046-question-selection-in-wrong-layer.md) | Question Selection Algorithm in Wrong Layer | P2 | 2026-02-02 |
| [DEBT-047](../_archive/debt/debt-047-spec-010-missing-webhook-controller.md) | SPEC-010 Missing Webhook Controller Documentation | P3 | 2026-02-02 |
| [DEBT-048](../_archive/debt/debt-048-hardcoded-url-paths-billing.md) | Hard-Coded URL Paths in Billing Controller | P2 | 2026-02-02 |
| [DEBT-049](../_archive/debt/debt-049-hardcoded-limits-not-centralized.md) | Hard-Coded Limits Not Centralized Across Controllers | P2 | 2026-02-02 |
| [DEBT-050](../_archive/debt/debt-050-missing-fake-implementations.md) | Missing Fake Implementations for 5 Repositories | P2 | 2026-02-02 |
| [DEBT-051](../_archive/debt/debt-051-controller-tests-use-mocks-not-fakes.md) | Controller Tests Use vi.fn() Instead of Fakes | P2 | 2026-02-02 |
| [DEBT-052](../_archive/debt/debt-052-unused-domain-service-compute-session-progress.md) | Unused Domain Service — computeSessionProgress | P2 | 2026-02-02 |
| [DEBT-053](../_archive/debt/debt-053-unused-tag-repository.md) | Unused TagRepository — Wired But Never Called | P2 | 2026-02-02 |
| [DEBT-054](../_archive/debt/debt-054-unused-domain-error-codes.md) | Unused Domain Error Codes — Defined But Never Thrown | P3 | 2026-02-02 |
| [DEBT-055](../_archive/debt/debt-055-magic-numbers-stats-undocumented.md) | Magic Numbers in Stats Controller Lack Documentation | P3 | 2026-02-02 |
| [DEBT-056](../_archive/debt/debt-056-repeated-getdeps-pattern.md) | Repeated getDeps Pattern Across 6 Controllers | P3 | 2026-02-02 |
| [DEBT-057](../_archive/debt/debt-057-webhook-error-stack-trace-lost.md) | Webhook Error Stack Trace Lost in Database | P3 | 2026-02-02 |
| [DEBT-058](../_archive/debt/debt-058-cancel-at-period-end-not-displayed.md) | cancelAtPeriodEnd Stored But Never Displayed in UI | P2 | 2026-02-02 |
| [DEBT-059](../_archive/debt/debt-059-stripe-api-version-undocumented.md) | Stripe API Version Hardcoded Without Documentation | P3 | 2026-02-02 |
| [DEBT-062](../_archive/debt/debt-062-confusing-redirect-control-flow.md) | Confusing Redirect Control Flow Relied on `redirect()` Throwing | P3 | 2026-02-02 |
| [DEBT-063](../_archive/debt/debt-063-missing-aria-labels-choice-buttons.md) | Missing ARIA Labels on Choice Buttons | P2 | 2026-02-02 |
| [DEBT-064](../_archive/debt/debt-064-missing-focus-indicators-error-buttons.md) | Missing Focus Indicators on Error Page Buttons | P3 | 2026-02-02 |
| [DEBT-065](../_archive/debt/debt-065-touch-targets-too-small.md) | Touch Targets Too Small (Dropdown Menu, Pricing Buttons) | P2 | 2026-02-02 |
| [DEBT-066](../_archive/debt/debt-066-no-success-toast-bookmark.md) | No Success Toast for Bookmark Action | P3 | 2026-02-02 |
| [DEBT-067](../_archive/debt/debt-067-generic-error-page-no-details.md) | Generic Error Page Lacks Error Details | P3 | 2026-02-02 |
| [DEBT-068](../_archive/debt/debt-068-missing-error-tsx-nested-routes.md) | Missing error.tsx in Nested Routes | P3 | 2026-02-02 |
| [DEBT-069](../_archive/debt/debt-069-document-stripe-eager-sync-pattern.md) | Document Stripe Eager Sync Pattern | P3 | 2026-02-02 |
| [DEBT-070](../_archive/debt/debt-070-checkout-failure-lacks-actionable-feedback.md) | Checkout Failure Lacks Actionable Feedback | P2 | 2026-02-02 |

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
