# AUDIT-011: Error Observability & Defensive Coding Sweep

**Date:** 2026-03-07
**Scope:** Full codebase (`src/`, `app/`) — error handling, type safety, array access, concurrency
**Method:** 5 parallel automated agents + manual line-by-line verification
**Axes:** Silent fallbacks, missing error handling, type safety, race conditions, dead code

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **P0** | 0 | No data-loss or critical security bugs |
| **P1** | 0 | No major functionality broken |
| **P2** | 1 bug + 1 debt | BUG-199: Unsafe array access. DEBT-286: Client-side error reporting (reclassified from BUG-200 — systemic SPEC-016 gap, not individual bugs) |
| **P3** | 1 | Webhook handler double-cast bypasses type safety |
| **P4** | 1 | Redundant condition after `.find()` |

**Overall:** The codebase remains well-engineered. `createAction` wrapper provides robust error handling for all server actions. No `as any`, no `@ts-ignore`, no `eslint-disable` in production code. No SQL injection, XSS, or hardcoded secrets. The issues found are defensive coding gaps (unsafe `[0]` array access) and a systemic client-side observability gap (SPEC-016 incomplete — `Sentry.captureException()` never called in app code).

---

## False Positives Investigated & Discarded

| Claim | File | Why Discarded |
|-------|------|---------------|
| P0 race in `nextIndex` increment | `concurrency.ts:14-16` | JS is single-threaded. Read + increment execute synchronously before `await`. No preemption possible. |
| Dashboard `Promise.all` crash | `dashboard/page.tsx:260` | `createAction` wraps all execution in try/catch and always returns `ActionResult`. Cannot throw. |
| Practice session TOCTOU | `drizzle-practice-session-repository.ts:248` | Uses conditional `WHERE isNull(endedAt)` + re-fetch retry. Standard optimistic concurrency pattern. |
| Stripe checkout inspection failure | `stripe-checkout-sessions.ts:149` | Intentional graceful degradation: logs warning, expires stale session, creates new one. |
| Rate limiter race | `drizzle-rate-limiter.ts:54` | PostgreSQL `INSERT...ON CONFLICT DO UPDATE` is atomic. Count increment is safe. |
| Idempotency key zombie race | `drizzle-idempotency-key-repository.ts:22` | Timestamp checks on `claimedAt` and `expiresAt` provide sufficient protection. |
| Missing error handling (general) | All `src/` and `app/` | `ApplicationError` pattern used consistently. All async ops have try/catch. All server actions wrapped by `createAction`. |

---

## Verified Findings

### BUG-199: Unsafe `[0]` array access without bounds checking (P2)

**1 crash-risk instance** (P2), 3 style-only instances (P4, already safe via downstream guards).

Tracer bullet verification found that 3 of the 4 original instances are protected by optional chaining, nullish coalescing, or `.filter()`. Only `stripe-subscription-normalizer.ts:55` has a real crash risk — it accesses `.current_period_end` and `.price.id` on the result of `data[0]` without any guard.

- `stripe-subscription-normalizer.ts:55` — **CRASH RISK.** Accesses properties without optional chaining after `[0]`
- `stripe-checkout-sessions.ts:133` — Safe. Guarded by `if (existingSession && existingUrl)` on line 135
- `clerk-auth-gateway.ts:44` — Safe. Uses `[0]?.emailAddress ?? null`
- `get-session-history.ts:58` — Safe. Followed by `.filter((id): id is string => ...)`

**Full details:** [`docs/bugs/bug-199-unsafe-array-index-access.md`](../bugs/bug-199-unsafe-array-index-access.md)

### ~~BUG-200~~ → DEBT-286: Client-side caught error reporting (P2) — RECLASSIFIED

Originally filed as BUG-200 with 5 instances of `console.error`-only or swallowed errors. **Deeper analysis revealed a systemic root cause:** `Sentry.captureException()` is called zero times in the entire application code. Sentry is initialized and auto-captures unhandled exceptions, but the codebase properly `.catch()`-es everything — so Sentry never sees caught errors. The individual locations are symptoms, not bugs.

**Reclassified as [DEBT-286](../debt/debt-286-client-side-error-reporting.md)** — extends SPEC-016 with a `reportClientError()` utility that wraps `Sentry.captureException()`, then systematically replaces all 6 ad-hoc `console.error` / bare-catch locations.

**Why reclassification, not individual fixes:** Adding `Sentry.captureException()` to each location ad-hoc would create the same inconsistent pattern that the server-side `Logger` port was designed to prevent. The proper fix is a single utility with systematic rollout.

### BUG-201: Clerk webhook double-cast bypasses type safety (P3)

Double `as unknown as` cast in webhook verification route bypasses TypeScript's type system entirely. Works today but fragile to Clerk SDK changes.

**Full details:** [`docs/bugs/bug-201-clerk-webhook-double-cast.md`](../bugs/bug-201-clerk-webhook-double-cast.md)

### BUG-202: Redundant condition after `.find()` (P4)

`if (failed && !failed.result.ok)` where the second check is always true by definition of how `.find()` selected the element.

**Full details:** [`docs/bugs/bug-202-redundant-condition-after-find.md`](../bugs/bug-202-redundant-condition-after-find.md)

---

## Clean Areas (No Issues Found)

- **Error handling architecture** — `ApplicationError` with typed codes used consistently across all layers
- **Server action safety** — `createAction` wrapper catches all errors, always returns `ActionResult`
- **External API integration** — Stripe calls wrapped in `callStripeWithRetry`, Clerk webhook verification wrapped in try/catch
- **Type safety** — No `as any`, no `@ts-ignore`, no `eslint-disable` in production code
- **Security** — No XSS (`dangerouslySetInnerHTML`), no SQL injection, no hardcoded secrets, no `eval()`
- **Resource management** — Event listeners and timeouts properly cleaned up
- **Promise handling** — `fireAndForget()` utility captures unhandled rejections
- **Domain purity** — Zero external imports in domain layer confirmed
