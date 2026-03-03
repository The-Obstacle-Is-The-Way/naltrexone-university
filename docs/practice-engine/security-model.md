# Practice Engine: Security Model

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Authentication, authorization, rate limiting, idempotency, data isolation
> **Last Verified:** 2026-03-03

---

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Mutation-heavy actions: `startPracticeSession`, `submitAnswer`, `toggleBookmark` |
| **Idempotency** | Mutations accept optional idempotency keys; when provided, controllers wrap execution with `withIdempotency` to prevent duplicate operations |
| **Exam answer secrecy** | Canonical policy: [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md). Active drift exists — see policy doc for current status. |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |
