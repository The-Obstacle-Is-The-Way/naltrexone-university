# Bug Audit #9 — Stripe Integration & Full Codebase Sweep

**Date:** 2026-03-09
**Scope:** Full codebase + deep Stripe integration audit
**Method:** Parallel agent sweeps (Stripe-focused + general codebase) + manual validation of all flagged findings
**Skills consulted:** `stripe-best-practices`, `stripe-subscriptions`

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **P0** | 0 | No data-loss or critical security bugs |
| **P1** | 0 | No major functionality broken |
| **P2** | 0 | No significant user-facing impact |
| **P3** | 0 | No minor bugs found |
| **P4** | 0 | No trivial issues found |

**Overall:** The codebase is clean. The Stripe integration follows best practices (Checkout Sessions, webhook signature verification, idempotency, subscription lifecycle coverage). The general codebase has proper auth enforcement, input validation, error handling, and data integrity.

---

## Stripe Integration Assessment

### Areas Audited

1. **Webhook handling** — Signature verification via `constructEvent()`, idempotency via `stripeEvents.claim()/lock()`, proper error serialization and retry marking
2. **Subscription lifecycle** — All critical events handled: `created`, `updated`, `deleted`, `paused`, `resumed`, `trial_will_end`, `pending_update_applied/expired`; checkout and invoice events also covered
3. **Checkout Sessions** — Proper success/cancel URL generation, eager sync on success page (ADR-014), Zod schema validation on webhook payloads
4. **Database sync** — Upsert on `userId` with proper unique constraint handling on `stripeSubscriptionId`; cascade deletes via user FK
5. **Payment gateway abstraction** — Clean port/adapter separation; domain entities have zero vendor identifiers
6. **Error handling** — `ApplicationError` with typed codes throughout; transient Stripe errors retried with exponential backoff
7. **Security** — Webhook secrets in env vars, signature verification before processing, rate limiting on checkout and webhooks, cross-account leakage guard on checkout success
8. **Concurrency** — Webhook idempotency via event claiming, `conflictStrategy: 'authoritative'` for customer mapping, reconciliation job with deterministic idempotency keys
9. **API version** — Pinned and reviewed (2026-01-28)

### Stripe Best Practices Compliance

| Practice | Status |
|----------|--------|
| Uses Checkout Sessions (not Charges API) | Compliant |
| Webhook signature verification | Compliant |
| Idempotency keys on mutations | Compliant |
| Dynamic payment methods (dashboard-configured) | Compliant |
| Subscription metadata includes user_id | Compliant |
| API version pinned | Compliant |
| No raw PAN handling | Compliant |

---

## Flagged-and-Validated Findings

The Stripe sweep initially flagged 14 potential issues. All were validated as false positives, correct behavior, or documented design decisions.

### False Positives

| # | Flagged Issue | Validation |
|---|---------------|------------|
| 1 | Portal session `PortalSessionInput` missing `userId` | **FP** — Use case properly abstracts `userId` → `externalCustomerId` lookup via `stripeCustomers.findByUserId()` |
| 2 | `items.data[0]` crash on empty array | **FP** — Zod schema enforces `.min(1)` at `stripe-webhook-schemas.ts:20`; checkout success uses optional chaining + assertion functions |
| 3 | Portal session auth bypass | **FP** — `requireUser()` enforced; `NOT_FOUND` for missing customer is correct behavior |
| 4 | Customer ID overwrite via `conflictStrategy: 'authoritative'` | **FP** — Stripe never sends multiple customer IDs for same user; correct last-write-wins for webhook replays |

### Correct Defensive Behavior

| # | Flagged Issue | Validation |
|---|---------------|------------|
| 5 | Subscription upsert unique constraint on `stripeSubscriptionId` | **Correct** — `isPostgresUniqueViolation` catch properly throws `CONFLICT` with descriptive message |
| 6 | Reconciliation job vs webhook race | **Correct** — Deterministic idempotency keys + status check before cancellation prevents double-cancel |

### Documented Design Decisions

| # | Flagged Issue | Validation |
|---|---------------|------------|
| 7 | Webhook vs checkout success page race condition | **ADR-014** — Both paths fetch fresh Stripe state; risk negligible for successful checkouts (status is `active` before redirect) |
| 8 | IP-based webhook rate limiting | **Intentional** — 1000/min generous limit; signature verification catches forgeries regardless of IP |
| 9 | Missing `customer.deleted` event | **Handled** — DB cascade deletes at `schema.ts:131,152` via Clerk user deletion path |
| 10 | Missing `payment_intent.*` events | **Intentional** — Subscription lifecycle events cover all needed state transitions; invoices handle payment failures |
| 11 | Single-item subscription assumption | **Intentional** — Checkout flow only creates single-item subscriptions; enforced by Zod `.min(1)` |
| 12 | No event ordering validation | **Intentional** — Events treated as independent state mutations; eventual consistency via fresh Stripe API retrieval |
| 13 | Subscription state drift risk | **ADR-014** — Acknowledged tradeoff; mitigated by eager sync + reconciliation job |
| 14 | Metadata `user_id` format not validated | **Correct** — Database FK constraint catches invalid UUIDs; Zod schema validates presence |

---

## General Codebase Assessment

### Areas Audited

| Area | Result |
|------|--------|
| Authentication/Authorization | All server actions enforce auth via `requireUser()` or `requireEntitledUserId()`; data queries filter by `userId` |
| Data Integrity | FK constraints, cascade/restrict policies, optimistic locking on sessions, unique constraints preventing races |
| SQL Injection | Impossible — Drizzle ORM used throughout, all queries parameterized |
| Error Handling | `ApplicationError` with typed codes; no silent failures or empty catch blocks |
| Null/Undefined Safety | Division-by-zero guards, optional chaining where appropriate, proper null checks |
| Input Validation | Zod schemas on all controller inputs; pagination limits enforced (max 100 items, max 10K offset) |
| Rate Limiting | Present on checkout, bookmarks, practice sessions, and webhooks |
| React State | No stale closure bugs found; proper `isMounted()` guards on async paths |
| Performance | No N+1 queries; proper database indexing; bounded queries with LIMIT |

### No bugs found at any severity level.

---

## Conclusion

The codebase is well-engineered with no actionable bugs. The Stripe integration follows all recommended best practices and has comprehensive test coverage. Previous audits (001-008) identified and resolved 200+ bugs; the current sweep confirms those fixes are holding and no new issues have been introduced.
