# Practice Engine: Security Model

> **Parent:** [Documentation map](../README.md)
> **Scope:** Authentication, authorization, rate limiting, idempotency, data isolation
> **Last Verified:** 2026-03-17

---

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Per-user limits on mutations: practice-session actions, `submitAnswer`, `setBookmark`, question ratings and reports, and billing setup and checkout (`src/adapters/controllers/`) |
| **Idempotency** | Mutations accept optional idempotency keys; when provided, controllers wrap execution with `withIdempotency` to prevent duplicate operations |
| **Exam answer secrecy** | Canonical policy: [Exam Answer Secrecy Policy](../product/practice/exam-answer-secrecy.md). Enforced in `GetNextQuestion`, `SubmitAnswer`, `GetPracticeSessionReview`, `GetPreviousAttempt`, and repository-backed status/history projections. |
| **Review identifier hardening** | Question review normalizes mixed `attemptId + sessionId` inputs to the session path at the route boundary, and server-side contracts reject bypassed mixed-id requests. |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |
