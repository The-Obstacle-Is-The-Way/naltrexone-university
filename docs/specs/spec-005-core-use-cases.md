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
├── get-next-question.ts
├── get-next-question.test.ts
├── submit-answer.ts
├── submit-answer.test.ts
└── index.ts
```

---

## Use Case: `CheckEntitlement`

**Goal:** Return whether a user is entitled (server-side, exact logic from `docs/specs/master_spec.md` Section 4.2).

**Dependencies (ports):**

- `SubscriptionRepository`

**Class name:** `CheckEntitlementUseCase`

**Input:**

```ts
export type CheckEntitlementInput = { userId: string };
```

**Output:**

```ts
export type CheckEntitlementOutput = {
  isEntitled: boolean;
};
```

**Constructor signature (required):**

```ts
export class CheckEntitlementUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}
}
```

**Algorithm:**

1. Load subscription by `userId` (may be null)
2. Compute `isEntitled(subscription, now())`
3. Return `{ isEntitled }`

---

## Use Case: `GetNextQuestion`

**Goal:** Provide the next question for either:

- a practice session (`sessionId`), or
- ad-hoc filters (no session)

This implements the behavior defined in `docs/specs/master_spec.md` Section 4.5.3.

**Dependencies (ports):**

- `QuestionRepository`
- `AttemptRepository`
- `PracticeSessionRepository`

**Class name:** `GetNextQuestionUseCase`

**Input (already validated by controller):**

```ts
export type GetNextQuestionInput =
  | { userId: string; sessionId: string; filters?: never }
  | {
      userId: string;
      sessionId?: never;
      filters: { tagSlugs: string[]; difficulties: Array<'easy' | 'medium' | 'hard'> };
    };
```

**Output:** A `NextQuestion` DTO (controller-level shape) or `null` if no remaining questions.

**Notes:**

- Use case MUST NOT expose `isCorrect` on any choice.
- In session mode, question order is taken from `practice_sessions.params_json.questionIds`.

**Constructor signature (required):**

```ts
export class GetNextQuestionUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}
}
```

---

## Use Case: `SubmitAnswer`

**Goal:** Record an answer attempt and return grading feedback.

This implements the behavior defined in `docs/specs/master_spec.md` Section 4.5.4.

**Dependencies (ports):**

- `QuestionRepository`
- `AttemptRepository`
- `PracticeSessionRepository`

**Class name:** `SubmitAnswerUseCase`

**Input:**

```ts
export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
};
```

**Output:**

```ts
export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
};
```

**Constructor signature (required):**

```ts
export class SubmitAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}
}
```

**Algorithm (high-level):**

1. Load published question by id (includes choices)
2. Validate choice belongs to question (else `ApplicationError('NOT_FOUND')`)
3. Compute grading via `gradeAnswer(question, choiceId)` (domain)
4. Insert attempt row
5. Compute whether explanation is shown:
   - exam session + not ended ⇒ `null`
   - else ⇒ `question.explanationMd`
6. Return output DTO

---

## Test Strategy (TDD)

Each use case has a `*.test.ts` using **fake** repositories:

- In-memory fakes for `QuestionRepository`, `AttemptRepository`, etc.
- No mocking libraries required

Tests should read as specifications:

- red → green → refactor
- prefer behavioral assertions (inputs → outputs + persisted attempt calls)
