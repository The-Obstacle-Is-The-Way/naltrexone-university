# Foundation Audit Report #2

**Date:** 2026-02-07
**Auditor:** Comprehensive six-axis audit of all critical paths
**Purpose:** Find all remaining bugs and debt before next feature sprint
**Status:** Open — issues identified, not yet fixed

> [!NOTE]
> This report is the second comprehensive audit. For the first, see `foundation-audit-report.md`.

---

## Executive Summary

Six parallel audits were conducted across the entire codebase:

1. **Stripe billing system** — end-to-end payment flow
2. **Practice engine** — question answering, sessions, scoring
3. **Auth and security** — Clerk integration, API protection, secrets
4. **UI layer** — components, server actions, data flow
5. **Database layer** — schema, repositories, transactions
6. **Code quality** — dead code, slop, test coverage

### Current State

| Category | Bugs Found | Debt Found |
|----------|-----------|------------|
| Billing / Stripe | 1 | 2 |
| Practice Engine | 2 | 1 |
| Auth / Security | 0 | 2 |
| UI / UX | 2 | 2 |
| Database | 0 | 2 |
| Testing | 0 | 2 |
| **Total** | **5 bugs** | **11 debt items** |

### False Positives Rejected

Several audit findings were verified against source code and rejected:

| Finding | Why Rejected |
|---------|-------------|
| Checkout session expiration fallthrough | Line 170 **does throw** `STRIPE_ERROR` — already fixed |
| Webhook ordering incomplete for `customer.subscription.*` | Line 130 calls `retrieveAndNormalizeStripeSubscription` — already fixed |
| `items.data[0]` without bounds check | Zod schema enforces `.min(1)` — validated before access |
| Cron token timing attack | `timingSafeEqual` on hashed values is correct — hash comparison prevents timing leaks |
| `.env.local` secrets exposed | File is gitignored and NOT in repository history |

---

## Bugs Found

### P1 (High)

| ID | Title | Component |
|----|-------|-----------|
| [BUG-105](bug-105-concurrent-answer-submission-race-condition.md) | Concurrent Answer Submission Can Create Duplicate Attempts | Practice Engine |
| [BUG-106](bug-106-stripe-customer-search-query-interpolation.md) | Stripe Customer Search Query Uses String Interpolation | Billing |

### P2 (Medium)

| ID | Title | Component |
|----|-------|-----------|
| [BUG-107](bug-107-hardcoded-route-incomplete-session-card.md) | Hardcoded Route Path in Incomplete Session Card | UI |
| [BUG-108](bug-108-submit-answer-unbounded-time-spent-seconds.md) | submitAnswer Allows Unbounded timeSpentSeconds at Use-Case Layer | Practice Engine |
| [BUG-109](bug-109-cron-route-limit-mismatch.md) | Cron Route MAX_LIMIT (1000) Exceeds Reconciliation MAX_LIMIT (500) | Billing |

---

## Debt Found

### P1 (High)

| ID | Title | Component |
|----|-------|-----------|
| [DEBT-158](../debt/debt-158-missing-idempotency-key-repository-tests.md) | Missing Tests for Idempotency Key Repository | Testing |

### P2 (Medium)

| ID | Title | Component |
|----|-------|-----------|
| [DEBT-159](../debt/debt-159-practice-session-review-missing-state-corruption-warning.md) | Practice Session Review Silently Backfills Missing Question States | Practice Engine |
| [DEBT-160](../debt/debt-160-cron-secret-not-required-in-production.md) | CRON_SECRET Not Enforced as Required in Production | Security |
| [DEBT-161](../debt/debt-161-incomplete-csp-headers.md) | Incomplete CSP Headers (Missing script-src, style-src, default-src) | Security |
| [DEBT-162](../debt/debt-162-stripe-portal-missing-retry-consistency.md) | Stripe Portal Session Creation Has Inconsistent Retry Behavior | Billing |
| [DEBT-163](../debt/debt-163-fakes-file-approaching-split-threshold.md) | Test Fakes File Approaching Split Threshold (1472 Lines) | Testing |
| [DEBT-164](../debt/debt-164-missing-suspense-boundary-practice-session-history.md) | Missing Suspense Boundary for Practice Session History Panel | UI |
| [DEBT-165](../debt/debt-165-stripe-gateway-barrel-file-inconsistency.md) | Stripe Gateway Modules Bypass Barrel File Pattern | Code Quality |

### P3 (Low)

| ID | Title | Component |
|----|-------|-----------|
| [DEBT-166](../debt/debt-166-practice-view-missing-focus-management-after-error.md) | Practice View Missing Focus Management After Error Recovery | Accessibility |
| [DEBT-167](../debt/debt-167-idempotency-key-prune-select-delete-race.md) | Idempotency Key Prune Uses Non-Atomic SELECT→DELETE | Database |
| [DEBT-168](../debt/debt-168-stripe-event-table-missing-check-constraint.md) | Stripe Events Table Missing CHECK Constraint on processedAt/error State | Database |

---

## Methodology

### Audit Scope

Each axis was explored by a dedicated agent with access to the full codebase:

1. **Stripe Billing** — All files in `src/adapters/gateways/stripe/`, `src/adapters/jobs/`, `app/api/webhooks/`, payment gateway ports
2. **Practice Engine** — All domain entities/services, use cases, practice controllers, session repositories
3. **Auth/Security** — Clerk gateway, middleware, API routes, env handling, security headers
4. **UI/UX** — All pages in `app/`, components, server actions, data fetching patterns
5. **Database** — Drizzle schema, all repositories, migrations, transaction handling
6. **Code Quality** — Dead code, unused exports, test coverage gaps, type safety

### Verification

All critical findings were verified against source code before documentation. The false-positive rate across all audit agents was approximately 30% — most concentrated in the Stripe billing audit where prior fixes (DEBT-125) had already addressed the reported issues.

---

## Related

- [Foundation Audit Report #1](foundation-audit-report.md) — 2026-02-02
- `docs/bugs/index.md` — Active bug index
- `docs/debt/index.md` — Active debt index
