# Security Model

> **Parent:** [Documentation map](../README.md)
> **Scope:** Authentication, authorization, rate limiting, idempotency, data isolation

---

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Row-level security** | None, by decision. No browser or third-party path reaches Postgres: the browser calls server actions, which reach the database only through repositories, so authorization is the auth gate plus `userId`-scoped WHERE clauses. Revisit if a direct database API (PostgREST, Hasura), a data path that bypasses the repositories, or a SOC 2 requirement appears (DEBT-332). |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Per-user limits on mutations: practice-session actions, `submitAnswer`, `setBookmark`, question ratings and reports, and billing setup and checkout (`src/adapters/controllers/`) |
| **Idempotency** | Mutations accept optional idempotency keys; when provided, controllers wrap execution with `withIdempotency` to prevent duplicate operations |
| **Exam answer secrecy** | Canonical policy: [Exam Answer Secrecy Policy](../product/practice/exam-answer-secrecy.md). Enforced in `GetNextQuestion`, `SubmitAnswer`, `GetPracticeSessionReview`, `GetPreviousAttempt`, and repository-backed status/history projections. |
| **Review identifier hardening** | Question review normalizes mixed `attemptId + sessionId` inputs to the session path at the route boundary, and server-side contracts reject bypassed mixed-id requests. |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |
