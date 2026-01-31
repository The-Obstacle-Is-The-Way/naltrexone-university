# ADR-001: Clean Architecture Layers

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team

---

## Context

We are building **Addiction Boards**, a subscription-based question bank for addiction medicine board exam preparation. The system involves:

- User authentication (Clerk)
- Payment processing (Stripe)
- Question management and practice sessions
- Progress tracking and statistics

We need an architecture that:
1. Is testable without external dependencies
2. Allows swapping frameworks without rewriting business logic
3. Separates concerns clearly
4. Follows SOLID principles

## Decision

We adopt **Clean Architecture** as defined by Robert C. Martin, with four concentric layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS & DRIVERS                      │
│  Next.js, Clerk SDK, Stripe SDK, Drizzle, React Components  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 INTERFACE ADAPTERS                   │    │
│  │   Server Actions, Route Handlers, Repositories,     │    │
│  │   Presenters, ViewModels                            │    │
│  │                                                      │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │              USE CASES                       │    │    │
│  │  │   SubmitAnswer, StartSession, CheckAccess,  │    │    │
│  │  │   ComputeStats, ToggleBookmark              │    │    │
│  │  │                                              │    │    │
│  │  │  ┌─────────────────────────────────────┐    │    │    │
│  │  │  │           ENTITIES                   │    │    │    │
│  │  │  │   Question, Choice, Attempt, User,  │    │    │    │
│  │  │  │   Subscription, PracticeSession     │    │    │    │
│  │  │  │                                      │    │    │    │
│  │  │  │   Business Rules:                    │    │    │    │
│  │  │  │   - gradeAnswer()                    │    │    │    │
│  │  │  │   - isEntitled()                     │    │    │    │
│  │  │  │   - computeAccuracy()                │    │    │    │
│  │  │  └─────────────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### The Dependency Rule

**Dependencies point inward only.** Inner layers know nothing about outer layers.

- Entities know nothing about Use Cases
- Use Cases know nothing about Adapters
- Adapters know nothing about Frameworks
- Data crosses boundaries as simple data structures (DTOs)

### Layer Definitions

#### Layer 1: Entities (Domain)

**Location:** `src/domain/`

**Contains:**
- Entity types (Question, Choice, Attempt, User, Subscription, PracticeSession)
- Value Objects (QuestionDifficulty, SubscriptionStatus, PracticeMode)
- Domain Services (pure functions with business rules)
- Domain Errors

**Rules:**
- Zero external dependencies (no imports from other layers)
- No framework code (no Next.js, no Drizzle, no Clerk)
- No I/O (no database, no network, no file system)
- 100% unit testable with no mocks

**Example:**
```typescript
// src/domain/entities/question.ts
export type Question = {
  id: string;
  slug: string;
  stemMd: string;
  explanationMd: string;
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  choices: Choice[];
};

// src/domain/services/grading.ts
export function gradeAnswer(question: Question, selectedChoiceId: string): GradeResult {
  const correctChoice = question.choices.find(c => c.isCorrect);
  if (!correctChoice) {
    throw new DomainError('Question has no correct choice');
  }
  return {
    isCorrect: selectedChoiceId === correctChoice.id,
    correctChoiceId: correctChoice.id,
  };
}
```

#### Layer 2: Use Cases (Application)

**Location:** `src/application/`

**Contains:**
- Use Case classes/functions (one per user action)
- Input/Output port interfaces (boundaries)
- Application-specific business rules

**Rules:**
- Depends only on Entities
- Defines interfaces for external services (repositories, gateways)
- Does not implement those interfaces
- Orchestrates entity logic

**Example:**
```typescript
// src/application/use-cases/submit-answer.ts
export interface QuestionRepository {
  findById(id: string): Promise<Question | null>;
}

export interface AttemptRepository {
  save(attempt: NewAttempt): Promise<Attempt>;
}

export class SubmitAnswerUseCase {
  constructor(
    private questions: QuestionRepository,
    private attempts: AttemptRepository,
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    const question = await this.questions.findById(input.questionId);
    if (!question) {
      throw new NotFoundError('Question not found');
    }

    const gradeResult = gradeAnswer(question, input.choiceId);

    const attempt = await this.attempts.save({
      userId: input.userId,
      questionId: question.id,
      selectedChoiceId: input.choiceId,
      isCorrect: gradeResult.isCorrect,
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

#### Layer 3: Interface Adapters

**Location:** `src/adapters/`

**Contains:**
- Repository implementations (Drizzle)
- Gateway implementations (Stripe, Clerk)
- Server Actions (Next.js)
- Route Handlers (Next.js)
- Presenters/ViewModels

**Rules:**
- Implements interfaces defined by Use Cases
- Converts between external formats and domain formats
- No business logic (only mapping and coordination)

**Example:**
```typescript
// src/adapters/repositories/drizzle-question-repository.ts
import { db } from '@/lib/db';
import { questions, choices } from '@/db/schema';
import type { QuestionRepository } from '@/application/use-cases/submit-answer';
import type { Question } from '@/domain/entities/question';

export class DrizzleQuestionRepository implements QuestionRepository {
  async findById(id: string): Promise<Question | null> {
    const row = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: { choices: true },
    });

    if (!row) return null;

    return this.toDomain(row);
  }

  private toDomain(row: DbQuestion): Question {
    return {
      id: row.id,
      slug: row.slug,
      stemMd: row.stemMd,
      explanationMd: row.explanationMd,
      difficulty: row.difficulty,
      status: row.status,
      choices: row.choices.map(c => ({
        id: c.id,
        label: c.label,
        textMd: c.textMd,
        isCorrect: c.isCorrect,
        sortOrder: c.sortOrder,
      })),
    };
  }
}
```

#### Layer 4: Frameworks & Drivers

**Location:** `app/`, `lib/`, `db/`, `components/`

**Contains:**
- Next.js pages and layouts
- React components
- Database configuration (Drizzle config, schema)
- External SDK initialization (Stripe, Clerk)
- UI framework (Tailwind, shadcn)

**Rules:**
- Glue code only
- Minimal logic
- Calls into adapters

## Directory Structure

```
src/
├── domain/                    # Layer 1: Entities
│   ├── entities/
│   │   ├── question.ts
│   │   ├── choice.ts
│   │   ├── attempt.ts
│   │   ├── user.ts
│   │   ├── subscription.ts
│   │   └── practice-session.ts
│   ├── value-objects/
│   │   ├── question-difficulty.ts
│   │   ├── question-status.ts
│   │   ├── subscription-status.ts
│   │   └── practice-mode.ts
│   ├── services/
│   │   ├── grading.ts
│   │   ├── entitlement.ts
│   │   ├── statistics.ts
│   │   └── shuffle.ts
│   └── errors/
│       └── domain-errors.ts
│
├── application/               # Layer 2: Use Cases
│   ├── use-cases/
│   │   ├── submit-answer.ts
│   │   ├── get-next-question.ts
│   │   ├── start-practice-session.ts
│   │   ├── end-practice-session.ts
│   │   ├── toggle-bookmark.ts
│   │   ├── get-user-stats.ts
│   │   ├── get-missed-questions.ts
│   │   ├── create-checkout-session.ts
│   │   └── check-entitlement.ts
│   ├── ports/
│   │   ├── repositories.ts    # Repository interfaces
│   │   └── gateways.ts        # External service interfaces
│   └── errors/
│       └── application-errors.ts
│
├── adapters/                  # Layer 3: Interface Adapters
│   ├── repositories/
│   │   ├── drizzle-question-repository.ts
│   │   ├── drizzle-attempt-repository.ts
│   │   ├── drizzle-user-repository.ts
│   │   └── drizzle-subscription-repository.ts
│   ├── gateways/
│   │   ├── stripe-payment-gateway.ts
│   │   └── clerk-auth-gateway.ts
│   ├── controllers/           # Server Actions
│   │   ├── question-controller.ts
│   │   ├── practice-controller.ts
│   │   ├── billing-controller.ts
│   │   └── stats-controller.ts
│   └── presenters/
│       └── question-presenter.ts
│
app/                           # Layer 4: Frameworks
├── (marketing)/
├── (app)/
├── api/
└── ...

db/                            # Layer 4: Frameworks
├── schema.ts
└── migrations/

lib/                           # Layer 4: Frameworks
├── db.ts
├── stripe.ts
└── ...

components/                    # Layer 4: Frameworks
└── ...
```

## Consequences

### Positive

1. **Testability** — Domain and Use Cases are 100% unit testable without mocks
2. **Framework Independence** — Can swap Next.js, Drizzle, or Clerk without touching business logic
3. **Screaming Architecture** — Directory structure tells you what the app does
4. **Deferred Decisions** — Framework choices can change late in development
5. **Parallel Development** — Teams can work on different layers independently

### Negative

1. **More Files** — More layers = more files and indirection
2. **Learning Curve** — Team must understand layer boundaries
3. **Mapping Overhead** — Data must be converted at each boundary

### Mitigations

- Use clear naming conventions
- Document layer responsibilities
- Create shared types at boundaries
- Use dependency injection for testability

## Composition Root

Dependencies are wired in a single location. Server Actions and Route Handlers compose their dependencies at the point of use, NOT via global singletons.

**Pattern:**
```typescript
// app/actions/submit-answer.ts
'use server';

export async function submitAnswer(input: SubmitAnswerInput, deps?: Dependencies) {
  // Composition happens here at the entry point
  const { questionRepo, attemptRepo, authGateway } = deps ?? createDependencies();

  // ... use case execution
}

// Production dependency factory
function createDependencies(): Dependencies {
  const userRepo = new DrizzleUserRepository(db);
  return {
    questionRepo: new DrizzleQuestionRepository(db),
    attemptRepo: new DrizzleAttemptRepository(db),
    authGateway: createClerkAuthGateway(userRepo),
  };
}
```

**Why no DI container?**
- Next.js Server Actions have no lifecycle hooks for DI
- Functions are the unit of composition, not classes
- Explicit wiring is more traceable than magic containers
- Test injection is simple: pass `deps` parameter

**Allowed composition locations:**
- `app/actions/*.ts` — Server Actions
- `app/api/**/route.ts` — Route Handlers
- `tests/**/*.test.ts` — Test files (with fakes)

**Prohibited:**
- Global singleton gateways/repositories
- Importing concrete implementations in use cases
- Framework code creating adapters outside composition points

---

## Compliance

### How to Verify

1. **Dependency Check:** Run `madge --circular src/` — no circular dependencies
2. **Import Enforcement:** Use `dependency-cruiser` with rules preventing inner layers importing outer layers (Biome does not provide import boundary enforcement)
3. **Test Coverage:** Domain and Use Cases must have 100% coverage without mocks

### Code Review Checklist

- [ ] No framework imports in `src/domain/`
- [ ] No database calls in `src/domain/`
- [ ] Use Cases depend only on interfaces, not implementations
- [ ] Adapters implement interfaces defined in `src/application/ports/`
- [ ] Business logic lives in Domain or Use Cases, not Adapters

## References

- Robert C. Martin, "Clean Architecture" (2017)
- Robert C. Martin, "The Clean Architecture" blog post (2012)
- Uncle Bob's Clean Architecture talk (YouTube)
