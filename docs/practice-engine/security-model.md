# Practice Engine: Security Model

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Authentication, authorization, rate limiting, idempotency, data isolation
> **Last Verified:** 2026-02-16

---

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Mutation-heavy actions: `startPracticeSession`, `submitAnswer`, `toggleBookmark` |
| **Idempotency** | Mutations accept optional idempotency keys; when provided, controllers wrap execution with `withIdempotency` to prevent duplicate operations |
| **No correctness leakage** | `correctChoiceId` and explanations hidden in exam mode until session end; `isCorrect` is returned per-submit but `correctChoiceId` is `null` so the UI cannot reveal which choice was correct |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |
