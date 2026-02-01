# ADR-003: Testing Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

We need a testing strategy that:

1. Gives confidence that the system works correctly
2. Runs fast enough for TDD workflow
3. Tests behavior, not implementation
4. Minimizes mock usage (mocks couple tests to implementation)
5. Aligns with Clean Architecture layer boundaries

## Decision

We adopt a **Testing Pyramid** aligned with our architecture layers:

```
                    ┌─────────┐
                    │   E2E   │  Few, slow, high confidence
                    │ (Playwright)
                    ├─────────┤
                    │         │
               ┌────┤Integration├────┐  Some, medium speed
               │    │ (Vitest)  │    │
               │    ├───────────┤    │
               │    │           │    │
          ┌────┤    │   Unit    │    ├────┐  Many, fast
          │    │    │ (Vitest)  │    │    │
          │    │    └───────────┘    │    │
          │    │                     │    │
    ┌─────┴────┴─────────────────────┴────┴─────┐
    │                 Domain                      │  100% unit testable
    │           (Zero dependencies)              │  NO MOCKS
    └─────────────────────────────────────────────┘
```

### Test Categories

#### Unit Tests (Domain + Use Cases)

**Scope:** `src/domain/` and `src/application/`

**Philosophy:**
- Test **behavior**, not implementation
- **NO MOCKS** for domain tests
- Use cases may use **fake implementations** of repository interfaces
- Tests should read like specifications

**Coverage Target:** 100% for domain services

**Naming Convention:** `*.test.ts` colocated with source

**Example Domain Test:**
```typescript
// src/domain/services/grading.test.ts
import { describe, it, expect } from 'vitest';
import { gradeAnswer } from './grading';
import { createQuestion } from '../test-helpers/factories';

describe('gradeAnswer', () => {
  it('returns isCorrect=true when selected choice is correct', () => {
    const question = createQuestion({
      choices: [
        { id: 'a', label: 'A', isCorrect: false },
        { id: 'b', label: 'B', isCorrect: true },
      ],
    });

    const result = gradeAnswer(question, 'b');

    expect(result.isCorrect).toBe(true);
    expect(result.correctChoiceId).toBe('b');
  });

  it('returns isCorrect=false when selected choice is wrong', () => {
    const question = createQuestion({
      choices: [
        { id: 'a', label: 'A', isCorrect: false },
        { id: 'b', label: 'B', isCorrect: true },
      ],
    });

    const result = gradeAnswer(question, 'a');

    expect(result.isCorrect).toBe(false);
    expect(result.correctChoiceId).toBe('b');
  });

  it('throws DomainError when question has no correct choice', () => {
    const question = createQuestion({
      choices: [
        { id: 'a', label: 'A', isCorrect: false },
        { id: 'b', label: 'B', isCorrect: false },
      ],
    });

    expect(() => gradeAnswer(question, 'a')).toThrow('no correct choice');
  });
});
```

**Example Use Case Test (with Fakes, not Mocks):**
```typescript
// src/application/use-cases/submit-answer.test.ts
import { describe, it, expect } from 'vitest';
import { SubmitAnswerUseCase } from './submit-answer';
import { FakeQuestionRepository, FakeAttemptRepository } from '../test-helpers/fakes';
import { createQuestion } from '../../domain/test-helpers/factories';

describe('SubmitAnswerUseCase', () => {
  it('records attempt and returns grade', async () => {
    const question = createQuestion({ id: 'q1' });
    const questionRepo = new FakeQuestionRepository([question]);
    const attemptRepo = new FakeAttemptRepository();

    const useCase = new SubmitAnswerUseCase(questionRepo, attemptRepo);

    const correctChoiceId =
      question.choices.find((c) => c.isCorrect)?.id ??
      (() => {
        throw new Error('Test fixture missing correct choice');
      })();

    const result = await useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: correctChoiceId,
    });

    expect(result.isCorrect).toBe(true);
    expect(attemptRepo.savedAttempts).toHaveLength(1);
  });
});
```

**Fakes vs Mocks:**
```typescript
// GOOD: Fake implementation (simple, in-memory)
class FakeQuestionRepository implements QuestionRepository {
  private questions: Map<string, Question> = new Map();

  constructor(initial: Question[] = []) {
    initial.forEach(q => this.questions.set(q.id, q));
  }

  async findById(id: string): Promise<Question | null> {
    return this.questions.get(id) ?? null;
  }
}

// BAD: Mock (couples test to implementation)
const mockRepo = {
  findById: vi.fn().mockResolvedValue(question),
};
```

#### Integration Tests (Adapters)

**Scope:** `src/adapters/` testing against real infrastructure

**Philosophy:**
- Test that adapters correctly translate between layers
- Use **real database** (Postgres via local service, Docker, or CI service)
- Mock external providers at the boundary (Stripe/Clerk) to keep integration tests fast and non-flaky
- Verify data persistence and retrieval

**Coverage Target:** All repository methods, all gateway methods

**Location:** `tests/integration/`

**Database Strategy:**
```typescript
// tests/integration/setup.ts
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function resetDatabase() {
  // Truncate all tables (faster than drop/recreate)
  await db.execute(sql`TRUNCATE users, questions, attempts CASCADE`);
}

export async function seedTestData() {
  // Insert known test fixtures
}
```

**Example Integration Test:**
```typescript
// tests/integration/drizzle-question-repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DrizzleQuestionRepository } from '@/adapters/repositories';
import { resetDatabase, seedTestData } from './setup';

describe('DrizzleQuestionRepository', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedTestData();
  });

  it('findById returns question with choices', async () => {
    const repo = new DrizzleQuestionRepository();

    const question = await repo.findById('test-question-1');

    expect(question).not.toBeNull();
    expect(question!.choices).toHaveLength(4);
    expect(question!.choices.some(c => c.isCorrect)).toBe(true);
  });

  it('findById returns null for non-existent question', async () => {
    const repo = new DrizzleQuestionRepository();

    const question = await repo.findById('does-not-exist');

    expect(question).toBeNull();
  });
});
```

#### E2E Tests (Full System)

**Scope:** Complete user flows through the browser

**Philosophy:**
- Test critical user journeys only
- Use Playwright
- Test against real (staging) or local environment
- Authenticate via Clerk testing utilities

**Coverage Target:** Happy paths for all major features

**Location:** `tests/e2e/`

**Example E2E Test:**
```typescript
// tests/e2e/practice-flow.spec.ts
import { test, expect } from '@playwright/test';
import { authenticateUser } from './helpers/auth';

test.describe('Practice Flow', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('user can answer a question and see feedback', async ({ page }) => {
    await page.goto('/app/practice');

    // Select first choice
    await page.locator('[data-testid="choice-option"]').first().click();

    // Submit answer
    await page.getByRole('button', { name: /submit/i }).click();

    // Verify feedback shown
    await expect(page.locator('[data-testid="answer-feedback"]')).toBeVisible();
    await expect(page.locator('[data-testid="explanation"]')).toBeVisible();
  });
});
```

### Test Helpers

#### Factories (Domain)

```typescript
// src/domain/test-helpers/factories.ts
import type { Question, Choice, User, Subscription } from '../entities';
import { QuestionDifficulty, QuestionStatus, SubscriptionStatus, SubscriptionPlan } from '../value-objects';

let idCounter = 0;
const nextId = () => `test-id-${++idCounter}`;

export function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: nextId(),
    slug: `test-question-${idCounter}`,
    stemMd: 'What is the answer?',
    explanationMd: 'The answer is B.',
    difficulty: QuestionDifficulty.Medium,
    status: QuestionStatus.Published,
    choices: [
      createChoice({ label: 'A', isCorrect: false }),
      createChoice({ label: 'B', isCorrect: true }),
    ],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createChoice(overrides: Partial<Choice> = {}): Choice {
  return {
    id: nextId(),
    questionId: 'q1',
    label: 'A',
    textMd: 'Choice text',
    isCorrect: false,
    sortOrder: 1,
    ...overrides,
  };
}

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: nextId(),
    email: `test${idCounter}@example.com`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: nextId(),
    userId: 'user1',
    plan: SubscriptionPlan.Monthly,
    status: SubscriptionStatus.Active,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

#### Fakes (Application)

```typescript
// src/application/test-helpers/fakes.ts
import type { QuestionRepository, AttemptRepository, UserRepository } from '../ports/repositories';
import type { Question, Attempt, User } from '../../domain/entities';

export class FakeQuestionRepository implements QuestionRepository {
  private questions = new Map<string, Question>();

  constructor(initial: Question[] = []) {
    initial.forEach(q => this.questions.set(q.id, q));
  }

  async findById(id: string): Promise<Question | null> {
    return this.questions.get(id) ?? null;
  }

  async findPublishedByFilters(/* ... */): Promise<Question[]> {
    return [...this.questions.values()].filter(q => q.status === 'published');
  }

  // Test helper
  add(question: Question) {
    this.questions.set(question.id, question);
  }
}

export class FakeAttemptRepository implements AttemptRepository {
  savedAttempts: Attempt[] = [];

  async save(attempt: Attempt): Promise<Attempt> {
    this.savedAttempts.push(attempt);
    return attempt;
  }

  async findByUserId(userId: string): Promise<Attempt[]> {
    return this.savedAttempts.filter(a => a.userId === userId);
  }
}
```

### CI and Tooling Configuration (SSOT)

To avoid documentation drift, the exact CI and tooling configuration lives in the repo:

- CI workflow: `.github/workflows/ci.yml`
- Package scripts: `package.json`
- Vitest config: `vitest.config.ts` + `vitest.integration.config.ts`
- Playwright config: `playwright.config.ts`

This ADR defines the **strategy and boundaries**; the files above define the **exact commands and versions**.

## Consequences

### Positive

1. **Fast Feedback** — Unit tests run in <1s, enabling TDD
2. **Confidence** — Integration tests verify real infrastructure
3. **Maintainability** — Tests don't break when implementation changes
4. **Documentation** — Tests describe expected behavior

### Negative

1. **Setup Complexity** — Need a Postgres database for local integration tests (local service, Docker, or Neon)
2. **Slower CI** — Integration + E2E adds time

### Mitigations

- Use test containers for local development
- Parallelize test jobs in CI
- Only run E2E on main branch or when relevant files change

## Anti-Patterns to Avoid

1. **NO excessive mocking** — If you need >2 mocks, refactor
2. **NO testing private methods** — Test public behavior
3. **NO snapshot tests for logic** — Only for UI regression
4. **NO flaky tests** — Fix or delete them
5. **NO testing framework code** — Trust Next.js, Drizzle, etc.

## References

- Martin Fowler, "TestPyramid" (2012)
- Kent Beck, "Test-Driven Development" (2002)
- Growing Object-Oriented Software, Guided by Tests (2009)
- Uncle Bob, "The Clean Coder" (2011) - Chapter on Testing
