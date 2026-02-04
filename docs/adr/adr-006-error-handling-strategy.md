# ADR-006: Error Handling Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-002 (Domain Model)

---

## Context

Error handling is a critical architectural decision. We need a strategy that:

1. Is **type-safe** — TypeScript should know which errors can occur
2. Is **explicit** — Callers can't ignore errors silently
3. Supports **Clean Architecture** — Different error handling at different layers
4. Works with **Next.js Server Actions** — Must serialize across the wire
5. Avoids **exception-based control flow** — Exceptions should be exceptional

Modern TypeScript has moved toward **Result types** (like `neverthrow` or Effect) for expected failures, reserving exceptions for truly unexpected situations.

**References:**
- [Error Handling with Result Types](https://typescript.tv/best-practices/error-handling-with-result-types/)
- [TypeScript Errors and Effect](https://davidmyno.rs/blog/typed-errors-and-effect/)
- [Simple and maintainable error-handling in TypeScript](https://dev.to/supermetrics/simple-and-maintainable-error-handling-in-typescript-56lm)

## Decision

We adopt a **layered error handling strategy**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRAMEWORKS (Next.js)                           │
│                                                                         │
│   Server Actions → ActionResult<T> (discriminated union)                │
│   Route Handlers → HTTP status codes + JSON body                        │
│   React Components → try/catch at boundaries + error.tsx                │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     ADAPTERS (Gateways/Repos)                   │   │
│   │                                                                 │   │
│   │   Translate external errors → ApplicationError                  │   │
│   │   Stripe SDK errors → ApplicationError('STRIPE_ERROR', ...)     │   │
│   │   Drizzle errors → ApplicationError('INTERNAL_ERROR', ...)      │   │
│   │                                                                 │   │
│   │   ┌─────────────────────────────────────────────────────────┐   │   │
│   │   │                    USE CASES                            │   │   │
│   │   │                                                         │   │   │
│   │   │   Throw ApplicationError for expected failures          │   │   │
│   │   │   - NOT_FOUND, VALIDATION_ERROR, UNAUTHENTICATED        │   │   │
│   │   │   - UNSUBSCRIBED, CONFLICT                              │   │   │
│   │   │                                                         │   │   │
│   │   │   ┌─────────────────────────────────────────────────┐   │   │   │
│   │   │   │                 DOMAIN                          │   │   │   │
│   │   │   │                                                 │   │   │   │
│   │   │   │   Throw DomainError for invariant violations    │   │   │   │
│   │   │   │   - INVALID_QUESTION, INVALID_CHOICE            │   │   │   │
│   │   │   │   - SESSION_ALREADY_ENDED                       │   │   │   │
│   │   │   └─────────────────────────────────────────────────┘   │   │   │
│   │   └─────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Error Types by Layer

#### Domain Errors (Domain Layer)

```typescript
// src/domain/errors/domain-errors.ts

export type DomainErrorCode =
  | 'INVALID_QUESTION'      // Question missing correct choice, invalid structure
  | 'INVALID_CHOICE'        // Choice doesn't belong to question
  | 'INVALID_SESSION'       // Session structure invalid
  | 'SESSION_ALREADY_ENDED' // Cannot modify ended session
  | 'NO_QUESTIONS_MATCH';   // Filter yields zero questions

export class DomainError extends Error {
  readonly _tag = 'DomainError' as const;

  constructor(
    public readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
```

**When to throw:** Business rule violations that should never happen if data is valid.

#### Application Errors (Use Case Layer)

```typescript
// src/application/errors/application-errors.ts

export type ApplicationErrorCode =
  | 'UNAUTHENTICATED'    // User not logged in
  | 'UNSUBSCRIBED'       // User lacks subscription
  | 'NOT_FOUND'          // Resource doesn't exist
  | 'VALIDATION_ERROR'   // Input validation failed
  | 'CONFLICT'           // State conflict (e.g., already exists)
  | 'STRIPE_ERROR'       // Payment provider error
  | 'INTERNAL_ERROR';    // Unexpected error (catch-all)

export class ApplicationError extends Error {
  readonly _tag = 'ApplicationError' as const;

  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
```

**When to throw:** Expected failures during use case execution.

#### Action Results (Frameworks Layer)

Server Actions return a discriminated union instead of throwing:

```typescript
// src/adapters/controllers/action-result.ts

export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STRIPE_ERROR'
  | 'INTERNAL_ERROR';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

// Helper to create success result
export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

// Helper to create error result
export function failure(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } };
}
```

### Error Flow Example

```typescript
// 1. Domain throws DomainError
function gradeAnswer(question: Question, choiceId: string): GradeResult {
  const correctChoice = question.choices.find(c => c.isCorrect);
  if (!correctChoice) {
    throw new DomainError('INVALID_QUESTION', 'No correct choice');
  }
  // ...
}

// 2. Use Case translates or adds context
class SubmitAnswerUseCase {
  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    const question = await this.questions.findById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    // DomainError bubbles up if question is invalid
    const result = gradeAnswer(question, input.choiceId);
    // ...
  }
}

// 3. Controller catches and returns ActionResult
export async function submitAnswerAction(
  questionId: string,
  choiceId: string
): Promise<ActionResult<SubmitAnswerOutput>> {
  try {
    const user = await authGateway.requireUser();
    const result = await useCase.execute({ userId: user.id, questionId, choiceId });
    return success(result);
  } catch (error) {
    return handleError(error);
  }
}

// 4. Error handler translates to ActionResult
function handleError(error: unknown): ActionResult<never> {
  if (isApplicationError(error)) {
    return failure(error.code, error.message, error.fieldErrors);
  }

  if (isDomainError(error)) {
    // Domain errors indicate programmer error or data corruption
    console.error('DomainError:', error);
    return failure('INTERNAL_ERROR', 'An unexpected error occurred');
  }

  // Unknown errors
  console.error('UnhandledError:', error);
  return failure('INTERNAL_ERROR', 'An unexpected error occurred');
}
```

### Client-Side Handling

```typescript
// components/question/AnswerForm.tsx
'use client';

import { submitAnswerAction } from '@/adapters/controllers/question-controller';
import { toast } from 'sonner';

export function AnswerForm({ questionId }: { questionId: string }) {
  const handleSubmit = async (choiceId: string) => {
    const result = await submitAnswerAction(questionId, choiceId);

    if (!result.ok) {
      // Type-safe error handling
      switch (result.error.code) {
        case 'UNSUBSCRIBED':
          redirect('/pricing');
          break;
        case 'NOT_FOUND':
          toast.error('Question not found');
          break;
        default:
          toast.error(result.error.message);
      }
      return;
    }

    // result.data is typed as SubmitAnswerOutput
    showFeedback(result.data);
  };
}
```

### Why Not Result Types Everywhere?

We considered using `neverthrow` or Effect throughout, but decided against it for this project:

1. **Serialization** — Server Actions must return JSON-serializable data. Result monads with methods don't serialize.
2. **Learning Curve** — Team familiarity with try/catch is higher
3. **Ecosystem** — Drizzle, Stripe SDK, etc. throw exceptions
4. **Pragmatism** — ActionResult at the boundary gives 80% of the benefit

**Future consideration:** If the codebase grows significantly, we may adopt Effect for complex orchestration in use cases.

### Route Handler Errors

Route handlers return HTTP status codes:

```typescript
// app/api/stripe/webhook/route.ts
export async function POST(request: NextRequest) {
  try {
    // ...
    return NextResponse.json({ received: true });
  } catch (error) {
    if (isApplicationError(error)) {
      const status = errorCodeToStatus(error.code);
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function errorCodeToStatus(code: ApplicationErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED': return 401;
    case 'UNSUBSCRIBED': return 403;
    case 'NOT_FOUND': return 404;
    case 'VALIDATION_ERROR': return 400;
    case 'CONFLICT': return 409;
    default: return 500;
  }
}
```

## Consequences

### Positive

1. **Type-Safe at Boundaries** — Clients can't ignore errors from server actions
2. **Clear Separation** — Domain errors vs application errors vs transport errors
3. **No Stack Traces Leaked** — ActionResult doesn't expose internal details
4. **Familiar Pattern** — Team knows try/catch; ActionResult is additive

### Negative

1. **Boilerplate** — Need error handler in every controller
2. **Two Patterns** — Throw internally, return externally
3. **Error Classification** — Must decide error codes for each case

### Mitigations

- Create shared `handleError` utility
- Lint rule to ensure all server actions return `ActionResult`
- Document error codes in API specs

## Compliance Checklist

- [ ] All Server Actions return `ActionResult<T>`
- [ ] No stack traces in client-facing error messages
- [ ] Domain errors logged and wrapped before returning
- [ ] Route handlers return appropriate HTTP status codes
- [ ] Client code uses discriminated union pattern for error handling

## References

- Ethan Resnick, ["Fixing TypeScript's Error Handling"](https://medium.com/@ethanresnick/fixing-error-handling-in-typescript-340873a31ecd)
- [neverthrow library](https://github.com/supermacro/neverthrow)
- [Effect TypeScript](https://effect.website/)
- Martin Fowler, "Notification Pattern"
