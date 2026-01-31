# ADR-011: API Design Principles

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture), ADR-006 (Error Handling)

---

## Context

We need consistent API design across:

1. **Server Actions** — Primary data mutation/fetching mechanism
2. **Route Handlers** — Webhooks and public endpoints
3. **Internal Boundaries** — Use case inputs/outputs

Good API design ensures:
- Predictable behavior for consumers
- Easy testing and debugging
- Type safety across boundaries
- Extensibility without breaking changes

## Decision

We adopt **contract-first design** with Zod schemas defining all boundaries.

### Design Principles

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        API DESIGN PRINCIPLES                             │
│                                                                          │
│   1. EXPLICIT CONTRACTS — Zod schemas define all inputs/outputs         │
│   2. FAIL FAST — Validate at the boundary, not deep in code             │
│   3. SINGLE RESPONSIBILITY — One action = one purpose                   │
│   4. PREDICTABLE RESPONSES — ActionResult<T> everywhere                 │
│   5. SEMANTIC NAMING — Verb + noun describes the action                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Server Action Conventions

#### Naming

```typescript
// Pattern: verb + noun (camelCase)
submitAnswer        // ✓ Clear action
getNextQuestion     // ✓ Clear retrieval
createCheckoutSession // ✓ Clear creation
toggleBookmark      // ✓ Clear toggle

// Avoid
handleAnswer        // ✗ Vague
processQuestion     // ✗ Vague
doSubscription      // ✗ Non-descriptive
```

#### Input Schemas

Every action has a Zod schema:

```typescript
// All inputs validated with Zod
import { z } from 'zod';

// Shared validators
export const zUuid = z.string().uuid();
export const zNonEmptyString = z.string().min(1);
export const zPagination = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// Action-specific schema
export const SubmitAnswerInputSchema = z.object({
  questionId: zUuid,
  choiceId: zUuid,
  sessionId: zUuid.optional(),
}).strict(); // Reject unknown fields

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerInputSchema>;
```

#### Output Types

Explicit TypeScript types for all outputs:

```typescript
// Explicit output type
export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
};

// Server action returns ActionResult
export async function submitAnswer(
  input: unknown // Accept unknown, validate inside
): Promise<ActionResult<SubmitAnswerOutput>> {
  // Validation
  const parsed = SubmitAnswerInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  // Business logic
  // ...

  return ok(result);
}
```

### Input Validation Rules

1. **Validate at boundary** — Controller validates, use case trusts input
2. **Use `.strict()`** — Reject unknown fields
3. **Sensible defaults** — Use `.default()` for optional with defaults
4. **Descriptive errors** — Zod provides field-level errors

```typescript
// Controller validates
export async function submitAnswer(input: unknown): Promise<ActionResult<...>> {
  const parsed = SubmitAnswerInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  // Use case receives validated input (type-safe)
  const result = await useCase.execute(parsed.data);
}
```

### Output Design Rules

1. **No internal IDs exposed unnecessarily** — Only expose what clients need
2. **Flatten when possible** — Avoid deep nesting
3. **Consistent naming** — camelCase for all fields
4. **Date as ISO string** — Serialize dates consistently

```typescript
// Good output design
export type GetNextQuestionOutput = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: Array<{
    id: string;
    label: string;
    textMd: string;
    sortOrder: number;
    // NOTE: isCorrect NOT exposed
  }>;
  session: {
    sessionId: string;
    mode: 'tutor' | 'exam';
    index: number;
    total: number;
  } | null;
};
```

### Route Handler Conventions

For webhooks and public APIs:

```typescript
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Explicit runtime
export const runtime = 'nodejs';

// Only POST
export async function POST(request: NextRequest) {
  // Read raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    );
  }

  try {
    // Process webhook
    const result = await processWebhook(body, signature);

    // Standard success response
    return NextResponse.json({ received: true });
  } catch (error) {
    // Standard error response
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    );
  }
}
```

### Use Case Boundaries

Use cases define their own Input/Output types:

```typescript
// src/application/use-cases/submit-answer.ts

// Use case input (already validated by controller)
export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
};

// Use case output (internal, may differ from API output)
export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  correctLabel: string;
  explanationMd: string;
  sessionComplete: boolean;
};

export class SubmitAnswerUseCase {
  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    // ...
  }
}
```

The controller may transform use case output for the API:

```typescript
// Controller transforms output for API
const useCaseResult = await useCase.execute(validated);

const apiOutput: SubmitAnswerAPIOutput = {
  attemptId: useCaseResult.attemptId,
  isCorrect: useCaseResult.isCorrect,
  correctChoiceId: useCaseResult.correctChoiceId,
  // Omit internal fields like sessionComplete if not needed by client
  explanationMd: showExplanation ? useCaseResult.explanationMd : null,
};
```

### Error Codes

Standardized error codes across all actions:

```typescript
export type ActionErrorCode =
  | 'UNAUTHENTICATED'   // 401 - Not logged in
  | 'UNSUBSCRIBED'      // 403 - No active subscription
  | 'FORBIDDEN'         // 403 - Not authorized for resource
  | 'NOT_FOUND'         // 404 - Resource doesn't exist
  | 'VALIDATION_ERROR'  // 400 - Input validation failed
  | 'CONFLICT'          // 409 - State conflict (e.g., already submitted)
  | 'RATE_LIMITED'      // 429 - Too many requests
  | 'STRIPE_ERROR'      // 502 - Payment provider error
  | 'INTERNAL_ERROR';   // 500 - Unexpected error
```

### Versioning Strategy

For future API evolution:

1. **No versioning initially** — We're an internal API
2. **Additive changes** — Add fields, don't remove
3. **Deprecation** — Mark deprecated fields, remove later
4. **Breaking changes** — New action name if needed

```typescript
// Adding a field (non-breaking)
export type GetNextQuestionOutput = {
  questionId: string;
  // ... existing fields ...
  estimatedTime?: number; // NEW optional field
};

// If breaking change needed, create new action
export async function getNextQuestionV2(input: unknown) {
  // New behavior
}
```

### Documentation

Each action should have JSDoc:

```typescript
/**
 * Submit an answer to a question.
 *
 * @param input.questionId - UUID of the question being answered
 * @param input.choiceId - UUID of the selected choice
 * @param input.sessionId - Optional practice session ID
 *
 * @returns The grading result with explanation (if allowed)
 *
 * @throws VALIDATION_ERROR - Invalid input format
 * @throws NOT_FOUND - Question or choice not found
 * @throws UNSUBSCRIBED - User lacks active subscription
 *
 * @example
 * const result = await submitAnswer({
 *   questionId: 'abc-123',
 *   choiceId: 'def-456',
 * });
 * if (result.ok) {
 *   console.log(result.data.isCorrect);
 * }
 */
export async function submitAnswer(
  input: unknown
): Promise<ActionResult<SubmitAnswerOutput>> {
  // ...
}
```

## Consequences

### Positive

1. **Type Safety** — Full TypeScript coverage across boundaries
2. **Predictability** — Consistent patterns across all actions
3. **Self-Documenting** — Zod schemas serve as documentation
4. **Testability** — Clear contracts make testing easier

### Negative

1. **Boilerplate** — Schema + type definitions for each action
2. **Duplication** — Similar types at different layers

### Mitigations

- Generate types from schemas where possible
- Use shared base schemas (zUuid, zPagination)
- Consider code generation if duplication grows

## Compliance Checklist

- [ ] Every server action has a Zod input schema
- [ ] Every server action returns ActionResult<T>
- [ ] Error codes are from the standard set
- [ ] No internal IDs leaked unnecessarily
- [ ] Dates serialized as ISO strings
- [ ] Actions have JSDoc documentation

## References

- [Zod Documentation](https://zod.dev/)
- [API Design Best Practices](https://swagger.io/resources/articles/best-practices-in-api-design/)
- [JSON API Specification](https://jsonapi.org/) (for inspiration, not strict compliance)
