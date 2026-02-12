# Practice Engine: Security Model

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Authentication, authorization, rate limiting, idempotency, data isolation
> **Last Verified:** 2026-02-11

---

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Mutation-heavy actions: `startPracticeSession`, `submitAnswer`, `toggleBookmark` |
| **Idempotency** | All mutations use idempotency keys to prevent duplicate operations |
| **No correctness leakage** | `isCorrect` never sent to client before answering; exam explanations hidden until session end |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |
