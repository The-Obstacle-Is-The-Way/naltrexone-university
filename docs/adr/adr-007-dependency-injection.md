# ADR-007: Dependency Injection Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

Clean Architecture requires the **Dependency Inversion Principle (DIP)**: high-level modules (use cases) should not depend on low-level modules (repositories, gateways). Both should depend on abstractions.

We need a dependency injection (DI) strategy that:

1. Supports **Clean Architecture** — Use cases receive interfaces, not implementations
2. Works with **Next.js App Router** — Server Components, Server Actions, Route Handlers
3. Is **testable** — Easy to swap implementations for testing
4. Avoids **over-engineering** — No heavy DI containers if not needed
5. Follows **SOLID principles** — Especially DIP and Single Responsibility

**Challenges with Next.js:**
- Server Components can't use context providers
- Each request is isolated (no singleton per request out of box)
- Server Actions are top-level async functions
- No traditional "application bootstrap" phase

**References:**
- [SOLID Principles in TypeScript](https://blog.logrocket.com/applying-solid-principles-typescript/)
- [Dependency Injection Best Practices](https://codezup.com/dependency-injection-in-typescript-best-practices/)
- [typed-inject](https://github.com/nicojs/typed-inject)
- [Clean Architecture Layering in Next.js with DI](https://dev.to/behnamrhp/how-we-fixed-nextjs-at-scale-di-clean-architecture-secrets-from-production-gnj)

## Decision

We adopt **Constructor Injection with Factory Functions** — a pragmatic approach that provides the benefits of DI without a heavy container framework.

### Pattern Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          COMPOSITION ROOT                                │
│                                                                          │
│   lib/container.ts — Creates and wires all dependencies                 │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    USE CASE FACTORIES                            │   │
│   │                                                                  │   │
│   │   createSubmitAnswerUseCase() → SubmitAnswerUseCase             │   │
│   │   createCheckEntitlementUseCase() → CheckEntitlementUseCase     │   │
│   │                                                                  │   │
│   │   Each factory wires concrete implementations to interfaces     │   │
│   │                                                                  │   │
│   │   ┌─────────────────────────────────────────────────────────┐   │   │
│   │   │              REPOSITORY FACTORIES                        │   │   │
│   │   │                                                          │   │   │
│   │   │   createQuestionRepository() → DrizzleQuestionRepository│   │   │
│   │   │   createAttemptRepository() → DrizzleAttemptRepository  │   │   │
│   │   └─────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interface Definitions (Ports)

Interfaces live in the Application layer:

```typescript
// src/application/ports/repositories.ts

import type { Question, Attempt, User, Subscription } from '@/domain/entities';

export interface QuestionRepository {
  findById(id: string): Promise<Question | null>;
  findPublishedByFilters(filters: QuestionFilters): Promise<Question[]>;
}

export interface AttemptRepository {
  save(attempt: NewAttempt): Promise<Attempt>;
  findByUserId(userId: string): Promise<Attempt[]>;
  findBySessionId(sessionId: string): Promise<Attempt[]>;
}

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
  save(subscription: NewSubscription): Promise<Subscription>;
  update(userId: string, updates: Partial<Subscription>): Promise<Subscription>;
}
```

```typescript
// src/application/ports/gateways.ts

import type { User } from '@/domain/entities';

export interface AuthGateway {
  getCurrentUser(): Promise<User | null>;
  requireUser(): Promise<User>;
  ensureUser(): Promise<User>;
}

export interface PaymentGateway {
  createCheckoutSession(input: CheckoutInput): Promise<{ url: string }>;
  createPortalSession(input: PortalInput): Promise<{ url: string }>;
  processWebhookEvent(body: string, signature: string): Promise<WebhookResult>;
}
```

### Concrete Implementations (Adapters)

Implementations live in the Adapters layer:

```typescript
// src/adapters/repositories/drizzle-question-repository.ts

import { db } from '@/lib/db';
import { questions, choices } from '@/db/schema';
import type { QuestionRepository } from '@/application/ports/repositories';

export class DrizzleQuestionRepository implements QuestionRepository {
  async findById(id: string): Promise<Question | null> {
    const row = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: { choices: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async findPublishedByFilters(filters: QuestionFilters): Promise<Question[]> {
    // Implementation
  }

  private toDomain(row: DbQuestion): Question {
    // Map database row to domain entity
  }
}
```

### Use Cases with Constructor Injection

Use cases receive dependencies via constructor:

```typescript
// src/application/use-cases/submit-answer.ts

import type { QuestionRepository, AttemptRepository } from '../ports/repositories';
import { gradeAnswer } from '@/domain/services/grading';

export class SubmitAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptRepository
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    const question = await this.questions.findById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const gradeResult = gradeAnswer(question, input.choiceId);

    const attempt = await this.attempts.save({
      userId: input.userId,
      questionId: question.id,
      selectedChoiceId: input.choiceId,
      isCorrect: gradeResult.isCorrect,
      timeSpentSeconds: 0,
      answeredAt: new Date(),
    });

    return {
      attemptId: attempt.id,
      isCorrect: gradeResult.isCorrect,
      correctChoiceId: gradeResult.correctChoiceId,
      explanationMd: question.explanationMd,
    };
  }
}
```

### Composition Root (Container)

Factory functions wire everything together:

```typescript
// lib/container.ts
import 'server-only';

import { DrizzleQuestionRepository } from '@/adapters/repositories/drizzle-question-repository';
import { DrizzleAttemptRepository } from '@/adapters/repositories/drizzle-attempt-repository';
import { DrizzleSubscriptionRepository } from '@/adapters/repositories/drizzle-subscription-repository';
import { ClerkAuthGateway } from '@/adapters/gateways/clerk-auth-gateway';
import { StripePaymentGateway } from '@/adapters/gateways/stripe-payment-gateway';

import { SubmitAnswerUseCase } from '@/application/use-cases/submit-answer';
import { GetNextQuestionUseCase } from '@/application/use-cases/get-next-question';
import { CheckEntitlementUseCase } from '@/application/use-cases/check-entitlement';

// Repository factories (singletons for production)
let questionRepo: DrizzleQuestionRepository | null = null;
let attemptRepo: DrizzleAttemptRepository | null = null;
let subscriptionRepo: DrizzleSubscriptionRepository | null = null;

export function getQuestionRepository() {
  if (!questionRepo) {
    questionRepo = new DrizzleQuestionRepository();
  }
  return questionRepo;
}

export function getAttemptRepository() {
  if (!attemptRepo) {
    attemptRepo = new DrizzleAttemptRepository();
  }
  return attemptRepo;
}

export function getSubscriptionRepository() {
  if (!subscriptionRepo) {
    subscriptionRepo = new DrizzleSubscriptionRepository();
  }
  return subscriptionRepo;
}

// Gateway factories
export function getAuthGateway() {
  return new ClerkAuthGateway();
}

export function getPaymentGateway() {
  return new StripePaymentGateway();
}

// Use case factories (create fresh per request)
export function createSubmitAnswerUseCase() {
  return new SubmitAnswerUseCase(
    getQuestionRepository(),
    getAttemptRepository()
  );
}

export function createGetNextQuestionUseCase() {
  return new GetNextQuestionUseCase(
    getQuestionRepository(),
    getAttemptRepository()
  );
}

export function createCheckEntitlementUseCase() {
  return new CheckEntitlementUseCase(
    getSubscriptionRepository()
  );
}
```

### Controller Usage

Server Actions use the container:

```typescript
// src/adapters/controllers/question-controller.ts
'use server';

import { getAuthGateway, createSubmitAnswerUseCase } from '@/lib/container';
import { handleError, ok, type ActionResult } from './action-result';

export async function submitAnswer(
  questionId: string,
  choiceId: string
): Promise<ActionResult<SubmitAnswerOutput>> {
  try {
    const authGateway = getAuthGateway();
    const user = await authGateway.requireUser();

    const useCase = createSubmitAnswerUseCase();
    const result = await useCase.execute({
      userId: user.id,
      questionId,
      choiceId,
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
```

### Testing with Fakes

For testing, inject fake implementations:

```typescript
// src/application/use-cases/submit-answer.test.ts
import { describe, it, expect } from 'vitest';
import { SubmitAnswerUseCase } from './submit-answer';
import { FakeQuestionRepository, FakeAttemptRepository } from '../test-helpers/fakes';
import { createQuestion } from '@/domain/test-helpers/factories';

describe('SubmitAnswerUseCase', () => {
  it('records attempt when answer submitted', async () => {
    // Arrange
    const question = createQuestion({ id: 'q1' });
    const questionRepo = new FakeQuestionRepository([question]);
    const attemptRepo = new FakeAttemptRepository();

    // Use case with injected fakes
    const useCase = new SubmitAnswerUseCase(questionRepo, attemptRepo);

    // Act
    const result = await useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: question.choices.find(c => c.isCorrect)!.id,
    });

    // Assert
    expect(result.isCorrect).toBe(true);
    expect(attemptRepo.savedAttempts).toHaveLength(1);
  });
});
```

### Test Container Override

For integration tests, override the container:

```typescript
// tests/integration/helpers/test-container.ts
import type { QuestionRepository } from '@/application/ports/repositories';

let overrides: Map<string, unknown> = new Map();

export function setRepositoryOverride(name: string, impl: unknown) {
  overrides.set(name, impl);
}

export function clearOverrides() {
  overrides.clear();
}

// Modified container for tests
export function getQuestionRepositoryForTest(): QuestionRepository {
  if (overrides.has('question')) {
    return overrides.get('question') as QuestionRepository;
  }
  return new DrizzleQuestionRepository();
}
```

### Why Not a DI Container Library?

We considered `inversify`, `tsyringe`, and `typed-inject` but decided against them:

1. **Complexity** — Container setup adds cognitive load
2. **Next.js Compatibility** — Some containers assume class decorators and long-lived processes
3. **Bundle Size** — Even small containers add overhead
4. **Simplicity** — Factory functions achieve the same goal with less magic

**Future consideration:** If we add more than 15-20 use cases, reconsider a lightweight container like `typed-inject`.

## Alternative Considered: Function Injection

Some teams prefer passing dependencies as function parameters:

```typescript
// Alternative pattern
export async function submitAnswer(
  input: SubmitAnswerInput,
  deps: {
    questions: QuestionRepository;
    attempts: AttemptRepository;
  }
): Promise<SubmitAnswerOutput> {
  // ...
}
```

We chose classes because:
- Clearer separation of "what" (interface) vs "how" (implementation)
- Easier to add shared state or caching later
- More familiar OOP pattern for the team

## Consequences

### Positive

1. **Testability** — Use cases tested with fakes, no mocking frameworks
2. **SOLID Compliance** — DIP satisfied via interfaces
3. **Explicit Dependencies** — Constructor shows all dependencies
4. **Simple** — No container framework to learn
5. **Next.js Compatible** — Works with Server Components and Actions

### Negative

1. **Manual Wiring** — Must update container when adding new dependencies
2. **No Auto-Discovery** — No automatic registration like some DI containers
3. **Singleton Management** — Must manage singleton lifecycle manually

### Mitigations

- Keep container file organized with clear sections
- Document dependency graph in this ADR
- Consider lint rules for unused dependencies

## Dependency Graph

```
SubmitAnswerUseCase
├── QuestionRepository (interface)
│   └── DrizzleQuestionRepository (implementation)
└── AttemptRepository (interface)
    └── DrizzleAttemptRepository (implementation)

CheckEntitlementUseCase
└── SubscriptionRepository (interface)
    └── DrizzleSubscriptionRepository (implementation)

Controllers (Server Actions)
├── AuthGateway (interface)
│   └── ClerkAuthGateway (implementation)
├── PaymentGateway (interface)
│   └── StripePaymentGateway (implementation)
└── Use Cases (via factory functions)
```

## Compliance Checklist

- [ ] Use cases receive dependencies via constructor, not import
- [ ] All repositories implement interfaces from `src/application/ports/`
- [ ] Composition root in `lib/container.ts` contains all wiring
- [ ] Tests use fakes, not the real container
- [ ] No circular dependencies between container and implementations

## References

- Robert C. Martin, "Clean Architecture" — Chapter 22: The Clean Architecture
- Mark Seemann, "Dependency Injection in .NET" (principles apply to TypeScript)
- [typed-inject GitHub](https://github.com/nicojs/typed-inject)
- [InversifyJS](https://inversify.io/)
