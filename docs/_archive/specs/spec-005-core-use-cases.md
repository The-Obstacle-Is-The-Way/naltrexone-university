# SPEC-005: Core Use Cases (Interactors)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Application
**Dependencies:** SPEC-003 (Domain Services), SPEC-004 (Ports)
**Implements:** ADR-001 (Clean Architecture), ADR-003 (Testing), ADR-006 (Errors)

---

## Objective

Define application **use cases** that orchestrate domain logic with ports.

Use cases MUST:

- Depend only on domain + application ports
- Throw `ApplicationError` for expected failures
- Be unit-testable with **fakes** (no DB, no Clerk, no Stripe)
- Be implemented as **classes** with constructor-injected ports (ADR-007)

Controllers (SPEC-010) are responsible for:

- Zod validation
- Composing concrete dependencies
- Mapping `ApplicationError` → `ActionResult<T>`

---

## Files to Create

```text
src/application/use-cases/
├── check-entitlement.ts
├── check-entitlement.test.ts
├── create-checkout-session.ts
├── create-checkout-session.test.ts
├── create-portal-session.ts
├── create-portal-session.test.ts
├── end-practice-session.ts
├── end-practice-session.test.ts
├── get-bookmarks.ts
├── get-bookmarks.test.ts
├── get-incomplete-practice-session.ts
├── get-incomplete-practice-session.test.ts
├── get-missed-questions.ts
├── get-missed-questions.test.ts
├── get-next-question.ts
├── get-next-question.test.ts
├── get-practice-session-review.ts
├── get-practice-session-review.test.ts
├── get-session-history.ts
├── get-session-history.test.ts
├── get-user-stats.ts
├── get-user-stats.test.ts
├── set-practice-session-question-mark.ts
├── set-practice-session-question-mark.test.ts
├── start-practice-session.ts
├── start-practice-session.test.ts
├── submit-answer.ts
├── submit-answer.test.ts
├── toggle-bookmark.ts
├── toggle-bookmark.test.ts
└── index.ts
```

---

## Use Case Inventory (Implemented)

**SSOT:** `src/application/use-cases/*.ts` (each use case defines its own input/output types, constructor dependencies, and error codes).

| Use Case | File | Primary Behavior Spec |
|----------|------|-----------------------|
| `CheckEntitlementUseCase` | `src/application/use-cases/check-entitlement.ts` | `docs/specs/master_spec.md` §4.2 |
| `GetNextQuestionUseCase` | `src/application/use-cases/get-next-question.ts` | `docs/specs/master_spec.md` §4.5.3, SPEC-012 |
| `SubmitAnswerUseCase` | `src/application/use-cases/submit-answer.ts` | `docs/specs/master_spec.md` §4.5.4, SPEC-012 |
| `StartPracticeSessionUseCase` | `src/application/use-cases/start-practice-session.ts` | `docs/specs/master_spec.md` §4.5.5, SPEC-013 |
| `EndPracticeSessionUseCase` | `src/application/use-cases/end-practice-session.ts` | `docs/specs/master_spec.md` §4.5.6, SPEC-013 |
| `GetIncompletePracticeSessionUseCase` | `src/application/use-cases/get-incomplete-practice-session.ts` | `docs/specs/master_spec.md` §4.5.14, SPEC-020 |
| `GetPracticeSessionReviewUseCase` | `src/application/use-cases/get-practice-session-review.ts` | `docs/specs/master_spec.md` §4.5.11, SPEC-020 |
| `SetPracticeSessionQuestionMarkUseCase` | `src/application/use-cases/set-practice-session-question-mark.ts` | `docs/specs/master_spec.md` §4.5.12 |
| `GetSessionHistoryUseCase` | `src/application/use-cases/get-session-history.ts` | `docs/specs/master_spec.md` §4.5.13, SPEC-020 |
| `ToggleBookmarkUseCase` | `src/application/use-cases/toggle-bookmark.ts` | `docs/specs/master_spec.md` §4.5.9, SPEC-014 |
| `GetBookmarksUseCase` | `src/application/use-cases/get-bookmarks.ts` | `docs/specs/master_spec.md` §4.5.12, SPEC-014 |
| `GetMissedQuestionsUseCase` | `src/application/use-cases/get-missed-questions.ts` | `docs/specs/master_spec.md` §4.5.8, SPEC-014 |
| `GetUserStatsUseCase` | `src/application/use-cases/get-user-stats.ts` | `docs/specs/master_spec.md` §4.5.7, SPEC-015 |
| `CreateCheckoutSessionUseCase` | `src/application/use-cases/create-checkout-session.ts` | `docs/specs/master_spec.md` §4.5.1, SPEC-011 |
| `CreatePortalSessionUseCase` | `src/application/use-cases/create-portal-session.ts` | `docs/specs/master_spec.md` §4.5.2, SPEC-011 |

### Conventions (Non-Negotiable)

- One class per file, named `XxxUseCase`, with a single `execute()` method.
- Dependencies injected via constructor (ports, logger, clock) — no global imports for infrastructure.
- Use cases throw `ApplicationError` for expected failures; controllers map to `ActionResult<T>`.
- Use cases depend on the smallest necessary interfaces (e.g., `AttemptWriter` rather than `AttemptRepository`) to keep contracts tight.

## Test Strategy (TDD)

Each use case has a `*.test.ts` using **fake** repositories:

- Use fakes from `src/application/test-helpers/fakes/` (in-memory implementations).
- No mocking libraries required

Tests should read as specifications:

- red → green → refactor
- prefer behavioral assertions (inputs → outputs + persisted attempt calls)
