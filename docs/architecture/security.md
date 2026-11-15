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

## Native CSP Report Privacy

Browser-native CSP reports bypass the SDK's scrubber and carry the document URL
and referrer. `lib/content-security-policy.ts` withholds native reporting
destinations when either URL needs credential-query redaction, including encoded
auth return URLs, and sets `Referrer-Policy: no-referrer` on those documents.
The report-only policy remains; ordinary documents retain their reporting
destinations.

This boundary lasts for the full document, including subsequent client-side
navigation. A suppressed document regains reporting only on a new document
load; changing the URL in an already reporting document does not remove its
reporting policy. The guarantee covers the owned full-document payment returns
and auth redirects, not arbitrary history changes. The CSP E2E positive control
proves browser evaluation and intercepted legacy delivery, not production
Reporting API or Sentry ingestion (BUG-379).

## Edge Rules

Vercel's firewall refuses some requests before the app runs. Its custom rules live in the Vercel dashboard, not in this repository, so this table is their one home: what each refuses, what it constrains, and when it comes out. Change the table in the same change as the rule; `vercel firewall rules list` shows the rules, marking any change not yet published. A Hobby project allows three custom rules, one of them a rate limit (Vercel Pro allows 40, any of them a rate limit; DEBT-512), so a rule that contains a gap until its fix ships names the check that removes it.

| Rule | Refuses | Constrains | Comes out |
|---|---|---|---|
| BUG-323 Clerk handshake nonce limit | More than 30 requests a minute from one address carrying `__clerk_handshake_nonce` in the query or a cookie (a rate limit) | More than 30 handshake returns a minute from one shared address, such as a group returning together on one network (DEBT-503 item 4) | Stays, as defense in depth (BUG-323) |
