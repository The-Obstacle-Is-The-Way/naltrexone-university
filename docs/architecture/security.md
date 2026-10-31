# Security Model

> **Parent:** [Documentation map](../README.md)
> **Scope:** Authentication, authorization, rate limiting, idempotency, data isolation

---

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **`Authorization` header** | Only the cron routes take it; see [Clerk's middleware](integrations/clerk.md#middleware-proxyts) (BUG-369) |
| **Edge rules** | Vercel firewall rules that refuse requests before the app runs; see [Edge Rules](#edge-rules) |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Row-level security** | None, by decision. No browser or third-party client connects to Postgres: browsers reach the server through pages and server actions, and providers through signed webhooks. Request handlers reach user data through repositories, so authorization is the auth gate plus `userId`-scoped WHERE clauses. Two server paths read the database directly: the scheduled reconcile job, behind `CRON_SECRET`, lists `stripe_subscriptions` across users (`app/api/cron/reconcile-stripe-subscriptions/route.ts`), and the health check runs `SELECT 1`. Revisit if a direct database API (PostgREST, Hasura), a data path that bypasses the repositories, or a SOC 2 requirement appears (DEBT-332). |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Per-user limits on mutations: practice-session actions, `submitAnswer`, `setBookmark`, question ratings and reports, and billing setup and checkout (`src/adapters/controllers/`) |
| **Idempotency** | Mutations accept optional idempotency keys; when provided, controllers wrap execution with `withIdempotency` to prevent duplicate operations |
| **Exam answer secrecy** | Canonical policy: [Exam Answer Secrecy Policy](../product/practice/exam-answer-secrecy.md). Enforced in `GetNextQuestion`, `SubmitAnswer`, `GetPracticeSessionReview`, `GetPreviousAttempt`, and repository-backed status/history projections. |
| **Review identifier hardening** | Question review normalizes mixed `attemptId + sessionId` inputs to the session path at the route boundary, and server-side contracts reject bypassed mixed-id requests. |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |

---

## Edge Rules

Vercel's firewall refuses some requests before the app runs. Its custom rules live in the Vercel dashboard, not in this repository, so this table is their one home: what each refuses, what it constrains, and when it comes out. Change the table in the same change as the rule; `vercel firewall rules list` shows the rules, marking any change not yet published. A Hobby project allows three custom rules, one of them a rate limit (Vercel Pro allows 40, any of them a rate limit; DEBT-512), so a rule that contains a gap until its fix ships names the check that removes it.

| Rule | Refuses | Constrains | Comes out |
|---|---|---|---|
| BUG-323 Clerk handshake nonce limit | More than 30 requests a minute from one address carrying `__clerk_handshake_nonce` in the query or a cookie (a rate limit) | Nothing a browser sends | Stays, as defense in depth (BUG-323) |
| BUG-369 refuse Clerk-readable Authorization | An `Authorization` header anywhere but `/api/cron/`; there, a value Clerk would read as a token: one holding a `.`, or starting with `ak_`, `mt_` or `oat_`, with or without a `Bearer` prefix | `CRON_SECRET` must hold no `.` and start with none of those; the [rotation procedure](environments.md#header-safe-cron_secret-across-vercel-scopes)'s hex value meets this | After BUG-369's two production checks, due 2026-11-06: a plain value on an unknown `/api/cron/` path gets the proxy's 401, and the next runs of both crons succeed. Production's proxy then passes the two configured cron routes to their handlers without Clerk, and answers any other request carrying the header with its own 401 |
| DEBT-503 refuse malformed Clerk cookies | A Cookie header no browser sends: a tab, a space before `=` after one of Clerk's cookie names, or a `%` escape that does not decode in Clerk's refresh or handshake cookie | Nothing a browser sends | After DEBT-503 item 4's production check, due 2026-11-06: from one address exempted from the rule, page loads carrying an expired dummy session token and a refresh cookie that does not decode get the proxy's 429 after 30 in a minute |
