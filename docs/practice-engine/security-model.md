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
| **Exam answer secrecy** | Canonical policy is [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md). Initial drift family ([BUG-180](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md), [BUG-181](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md), [BUG-185](../_archive/bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md)) is archived as fixed; additional drift remains open in [BUG-186](../bugs/bug-186-active-exam-review-projection-leaks-correctness.md), [BUG-187](../bugs/bug-187-dashboard-accuracy-includes-active-exam-attempts.md), [BUG-191](../bugs/bug-191-get-next-question-leaks-latestIsCorrect-active-exam.md), [BUG-192](../bugs/bug-192-history-page-exposes-active-exam-correctness.md), [BUG-193](../bugs/bug-193-submit-answer-returns-isCorrect-active-exam.md). |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |
