# SPEC-005: Core Use Cases (Interactors)

**Status:** Ready
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

Controllers (SPEC-010) are responsible for:

- Zod validation
- Composing concrete dependencies
- Mapping `ApplicationError` → `ActionResult<T>`

---

## Files to Create

```
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

**Algorithm:**

1. Load subscription by `userId` (may be null)
2. Compute `isEntitled(subscription, now)`
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

---

## Use Case: `SubmitAnswer`

**Goal:** Record an answer attempt and return grading feedback.

This implements the behavior defined in `docs/specs/master_spec.md` Section 4.5.4.

**Dependencies (ports):**

- `QuestionRepository`
- `AttemptRepository`
- `PracticeSessionRepository`

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

