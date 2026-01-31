# SPEC-010: Server Actions (Controllers)

**Status:** Ready
**Layer:** Adapters (Interface Adapters)
**Dependencies:** SPEC-005 (Use Cases), SPEC-007-009 (Adapters)
**Implements:** ADR-001, ADR-006

---

## Objective

Define Next.js Server Actions that serve as **Controllers** in Clean Architecture. These actions compose use cases with their dependencies and handle HTTP concerns (validation, error mapping, response formatting).

---

## Files to Create

> **Note:** Per ADR-012, server actions are Controllers in Clean Architecture and live in `src/adapters/controllers/`.

```
src/adapters/controllers/
├── action-result.ts
├── question-controller.ts
├── question-controller.test.ts
├── billing-controller.ts
├── billing-controller.test.ts
├── practice-controller.ts
├── stats-controller.ts
├── review-controller.ts
├── bookmark-controller.ts
└── index.ts
```

---

## Design Pattern: Controller + Composition Root

```
┌─────────────────────────────────────────────────┐
│         FRAMEWORKS (Next.js)                    │
│                                                 │
│   Server Action (entry point)                   │
│   - validates input (Zod)                       │
│   - composes dependencies                       │
│   - calls use case                              │
│   - maps errors to responses                    │
│                                                 │
└─────────────────────────────────────────────────┘
                    │
                    │ composes & calls
                    ▼
┌─────────────────────────────────────────────────┐
│         APPLICATION LAYER                       │
│                                                 │
│   UseCase.execute(input)                        │
│   - pure business logic                         │
│   - uses injected ports                         │
│                                                 │
└─────────────────────────────────────────────────┘
                    │
                    │ uses
                    ▼
┌─────────────────────────────────────────────────┐
│         ADAPTERS LAYER                          │
│                                                 │
│   DrizzleRepositories                           │
│   ClerkAuthGateway                              │
│   StripePaymentGateway                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Test Strategy

Server Action tests use **Fake** implementations for all dependencies (per ADR-003). No real database or external services.

---

## Test First

### File: `src/adapters/controllers/question-controller.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { submitAnswer } from './submit-answer';
import {
  FakeQuestionRepository,
  FakeChoiceRepository,
  FakeAttemptRepository,
  FakeAuthGateway,
} from '@/test/helpers/fakes';
import type { Question, Choice, User } from '@/src/domain/entities';

describe('submitAnswer action', () => {
  let questionRepo: FakeQuestionRepository;
  let choiceRepo: FakeChoiceRepository;
  let attemptRepo: FakeAttemptRepository;
  let authGateway: FakeAuthGateway;

  const mockUser: User = {
    id: 'user-1',
    clerkUserId: 'clerk_123',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQuestion: Question = {
    id: 'q-1',
    slug: 'test-question',
    stemMd: 'What is the answer?',
    explanationMd: 'The answer is B.',
    difficulty: 'medium',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChoices: Choice[] = [
    { id: 'c-1', questionId: 'q-1', label: 'A', textMd: 'Wrong', isCorrect: false, sortOrder: 1 },
    { id: 'c-2', questionId: 'q-1', label: 'B', textMd: 'Right', isCorrect: true, sortOrder: 2 },
  ];

  beforeEach(() => {
    questionRepo = new FakeQuestionRepository();
    choiceRepo = new FakeChoiceRepository();
    attemptRepo = new FakeAttemptRepository();
    authGateway = new FakeAuthGateway();

    // Set up test data
    questionRepo.add(mockQuestion);
    mockChoices.forEach(c => choiceRepo.add(c));
    authGateway.setCurrentUser(mockUser);
  });

  it('returns success with correct answer', async () => {
    const result = await submitAnswer(
      {
        questionId: 'q-1',
        selectedChoiceId: 'c-2',
        timeSpentSeconds: 30,
      },
      { questionRepo, choiceRepo, attemptRepo, authGateway }
    );

    expect(result.success).toBe(true);
    expect(result.data?.isCorrect).toBe(true);
  });

  it('returns success with incorrect answer', async () => {
    const result = await submitAnswer(
      {
        questionId: 'q-1',
        selectedChoiceId: 'c-1',
        timeSpentSeconds: 30,
      },
      { questionRepo, choiceRepo, attemptRepo, authGateway }
    );

    expect(result.success).toBe(true);
    expect(result.data?.isCorrect).toBe(false);
    expect(result.data?.correctChoiceId).toBe('c-2');
  });

  it('records attempt in repository', async () => {
    await submitAnswer(
      {
        questionId: 'q-1',
        selectedChoiceId: 'c-2',
        timeSpentSeconds: 30,
      },
      { questionRepo, choiceRepo, attemptRepo, authGateway }
    );

    const attempts = attemptRepo.getAll();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].userId).toBe('user-1');
  });

  it('returns error when not authenticated', async () => {
    authGateway.setCurrentUser(null);

    const result = await submitAnswer(
      {
        questionId: 'q-1',
        selectedChoiceId: 'c-2',
        timeSpentSeconds: 30,
      },
      { questionRepo, choiceRepo, attemptRepo, authGateway }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNAUTHENTICATED');
  });

  it('returns error for invalid question', async () => {
    const result = await submitAnswer(
      {
        questionId: 'nonexistent',
        selectedChoiceId: 'c-2',
        timeSpentSeconds: 30,
      },
      { questionRepo, choiceRepo, attemptRepo, authGateway }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('validates input schema', async () => {
    const result = await submitAnswer(
      {
        questionId: '', // invalid: empty string
        selectedChoiceId: 'c-2',
        timeSpentSeconds: -1, // invalid: negative
      },
      { questionRepo, choiceRepo, attemptRepo, authGateway }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
```

### File: `src/adapters/controllers/billing-controller.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkEntitlement } from './check-entitlement';
import { FakeSubscriptionRepository, FakeAuthGateway } from '@/test/helpers/fakes';
import type { User, Subscription } from '@/src/domain/entities';

describe('checkEntitlement action', () => {
  let subscriptionRepo: FakeSubscriptionRepository;
  let authGateway: FakeAuthGateway;

  const mockUser: User = {
    id: 'user-1',
    clerkUserId: 'clerk_123',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    subscriptionRepo = new FakeSubscriptionRepository();
    authGateway = new FakeAuthGateway();
    authGateway.setCurrentUser(mockUser);
  });

  it('returns entitled=true for active subscription', async () => {
    subscriptionRepo.add({
      id: 'sub-1',
      userId: 'user-1',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      priceId: 'price_monthly',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await checkEntitlement({}, { subscriptionRepo, authGateway });

    expect(result.success).toBe(true);
    expect(result.data?.isEntitled).toBe(true);
  });

  it('returns entitled=false for no subscription', async () => {
    const result = await checkEntitlement({}, { subscriptionRepo, authGateway });

    expect(result.success).toBe(true);
    expect(result.data?.isEntitled).toBe(false);
  });

  it('returns entitled=false for expired subscription', async () => {
    subscriptionRepo.add({
      id: 'sub-1',
      userId: 'user-1',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      priceId: 'price_monthly',
      currentPeriodEnd: new Date(Date.now() - 1000), // expired
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await checkEntitlement({}, { subscriptionRepo, authGateway });

    expect(result.success).toBe(true);
    expect(result.data?.isEntitled).toBe(false);
  });

  it('returns error when not authenticated', async () => {
    authGateway.setCurrentUser(null);

    const result = await checkEntitlement({}, { subscriptionRepo, authGateway });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNAUTHENTICATED');
  });
});
```

---

## Implementation

### File: `src/adapters/controllers/question-controller.ts`

```typescript
'use server';

import { z } from 'zod';
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';
import { DrizzleQuestionRepository, DrizzleAttemptRepository } from '@/src/adapters/repositories';
import { DrizzleChoiceRepository } from '@/src/adapters/repositories';
import { createClerkAuthGateway } from '@/src/adapters/gateways';
import { DrizzleUserRepository } from '@/src/adapters/repositories';
import { db } from '@/lib/db';
import { ApplicationError } from '@/src/application/errors/application-errors';
import type { QuestionRepository, ChoiceRepository, AttemptRepository, AuthGateway } from '@/src/application/ports';

/**
 * Input validation schema
 */
const SubmitAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  selectedChoiceId: z.string().uuid(),
  timeSpentSeconds: z.number().int().min(0),
  practiceSessionId: z.string().uuid().optional(),
});

type SubmitAnswerInput = z.infer<typeof SubmitAnswerInputSchema>;

/**
 * Action result type
 */
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

/**
 * Dependencies type (for testing)
 */
type Dependencies = {
  questionRepo: QuestionRepository;
  choiceRepo: ChoiceRepository;
  attemptRepo: AttemptRepository;
  authGateway: AuthGateway;
};

/**
 * Submit answer server action
 */
export async function submitAnswer(
  input: SubmitAnswerInput,
  deps?: Dependencies
): Promise<ActionResult<{
  isCorrect: boolean;
  correctChoiceId: string;
  correctLabel: string;
  explanationMd: string;
}>> {
  try {
    // Validate input
    const validationResult = SubmitAnswerInputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          fieldErrors: validationResult.error.flatten().fieldErrors,
        },
      };
    }

    // Compose dependencies (use injected deps for testing, or create real ones)
    const { questionRepo, choiceRepo, attemptRepo, authGateway } = deps ?? createDependencies();

    // Get authenticated user
    const user = await authGateway.requireUser();

    // Execute use case
    const useCase = new SubmitAnswerUseCase(questionRepo, choiceRepo, attemptRepo);
    const result = await useCase.execute({
      userId: user.id,
      questionId: validationResult.data.questionId,
      selectedChoiceId: validationResult.data.selectedChoiceId,
      timeSpentSeconds: validationResult.data.timeSpentSeconds,
      practiceSessionId: validationResult.data.practiceSessionId ?? null,
    });

    return { success: true, data: result };
  } catch (error) {
    return mapErrorToResult(error);
  }
}

/**
 * Create production dependencies
 */
function createDependencies(): Dependencies {
  const userRepo = new DrizzleUserRepository(db);
  return {
    questionRepo: new DrizzleQuestionRepository(db),
    choiceRepo: new DrizzleChoiceRepository(db),
    attemptRepo: new DrizzleAttemptRepository(db),
    authGateway: createClerkAuthGateway(userRepo),
  };
}

/**
 * Map errors to action result
 */
function mapErrorToResult(error: unknown): ActionResult<never> {
  if (error instanceof ApplicationError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      },
    };
  }

  console.error('Unexpected error:', error);
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
}
```

### File: `src/adapters/controllers/billing-controller.ts` (checkEntitlement export)

```typescript
'use server';

import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import { DrizzleSubscriptionRepository, DrizzleUserRepository } from '@/src/adapters/repositories';
import { createClerkAuthGateway } from '@/src/adapters/gateways';
import { db } from '@/lib/db';
import { ApplicationError } from '@/src/application/errors/application-errors';
import type { SubscriptionRepository, AuthGateway } from '@/src/application/ports';

/**
 * Action result type
 */
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/**
 * Dependencies type (for testing)
 */
type Dependencies = {
  subscriptionRepo: SubscriptionRepository;
  authGateway: AuthGateway;
};

/**
 * Check entitlement server action
 */
export async function checkEntitlement(
  _input: Record<string, never>,
  deps?: Dependencies
): Promise<ActionResult<{
  isEntitled: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null;
}>> {
  try {
    const { subscriptionRepo, authGateway } = deps ?? createDependencies();

    const user = await authGateway.requireUser();

    const useCase = new CheckEntitlementUseCase(subscriptionRepo);
    const result = await useCase.execute({ userId: user.id });

    return { success: true, data: result };
  } catch (error) {
    return mapErrorToResult(error);
  }
}

function createDependencies(): Dependencies {
  const userRepo = new DrizzleUserRepository(db);
  return {
    subscriptionRepo: new DrizzleSubscriptionRepository(db),
    authGateway: createClerkAuthGateway(userRepo),
  };
}

function mapErrorToResult(error: unknown): ActionResult<never> {
  if (error instanceof ApplicationError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  console.error('Unexpected error:', error);
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
}
```

### File: `src/adapters/controllers/index.ts`

```typescript
export { submitAnswer } from './submit-answer';
export { checkEntitlement } from './check-entitlement';
export { getNextQuestion } from './get-next-question';
export { createCheckout } from './create-checkout';
```

---

## Quality Gate

```bash
pnpm test src/adapters/controllers/
```

---

## Definition of Done

- [ ] Server actions compose use cases with dependencies
- [ ] Input validation using Zod schemas
- [ ] ApplicationError mapped to typed responses
- [ ] Dependency injection for testability
- [ ] All tests pass with fake dependencies
- [ ] 'use server' directive on all actions
- [ ] Barrel export in index.ts
