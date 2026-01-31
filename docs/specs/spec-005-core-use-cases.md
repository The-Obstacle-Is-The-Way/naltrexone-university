# SPEC-005: Core Use Cases

**Status:** Ready
**Layer:** Application
**Dependencies:** SPEC-003 (Domain Services), SPEC-004 (Ports)
**Implements:** ADR-001, ADR-003, ADR-007

---

## Objective

Implement use case classes that orchestrate domain logic with repository/gateway ports. Use cases are the **application-specific business rules** - they coordinate entities and services to fulfill user intentions.

---

## Design Pattern: Use Case (Interactor)

```
Controller → Use Case → Domain Services + Repositories
                ↓
          ApplicationError or Result
```

---

## Files to Create

```
src/application/
├── use-cases/
│   ├── submit-answer.ts
│   ├── submit-answer.test.ts
│   ├── get-next-question.ts
│   ├── get-next-question.test.ts
│   ├── check-entitlement.ts
│   ├── check-entitlement.test.ts
│   └── index.ts
└── test-helpers/
    └── fakes.ts
```

---

## Test First (Using Fakes, NOT Mocks)

Per ADR-003: We use **Fakes** (in-memory implementations) instead of mocks. This tests behavior, not implementation.

### File: `src/application/test-helpers/fakes.ts`

```typescript
import type { Question, Choice, Attempt, User, Subscription } from '@/src/domain/entities';
import type {
  QuestionRepository,
  ChoiceRepository,
  AttemptRepository,
  UserRepository,
  SubscriptionRepository,
  QuestionWithChoices,
  QuestionFilters,
  CreateAttemptInput,
} from '../ports';

/**
 * Fake QuestionRepository for testing
 */
export class FakeQuestionRepository implements QuestionRepository {
  private questions: Question[] = [];
  private choicesByQuestion: Map<string, Choice[]> = new Map();

  constructor(initialQuestions: Question[] = []) {
    this.questions = [...initialQuestions];
  }

  addQuestion(q: Question, choices: Choice[] = []) {
    this.questions.push(q);
    this.choicesByQuestion.set(q.id, choices);
  }

  async findById(id: string): Promise<Question | null> {
    return this.questions.find(q => q.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Question | null> {
    return this.questions.find(q => q.slug === slug) ?? null;
  }

  async findPublished(limit = 100): Promise<readonly Question[]> {
    return this.questions.filter(q => q.status === 'published').slice(0, limit);
  }

  async findPublishedByFilters(filters: QuestionFilters, limit = 100): Promise<readonly Question[]> {
    let result = this.questions.filter(q => q.status === 'published');
    if (filters.excludeIds?.length) {
      result = result.filter(q => !filters.excludeIds!.includes(q.id));
    }
    if (filters.difficulties?.length) {
      result = result.filter(q => filters.difficulties!.includes(q.difficulty));
    }
    return result.slice(0, limit);
  }

  async findWithChoices(questionId: string): Promise<QuestionWithChoices | null> {
    const question = await this.findById(questionId);
    if (!question) return null;
    const choices = this.choicesByQuestion.get(questionId) ?? [];
    return { ...question, choices };
  }
}

/**
 * Fake ChoiceRepository for testing
 */
export class FakeChoiceRepository implements ChoiceRepository {
  private choices: Choice[] = [];

  constructor(initialChoices: Choice[] = []) {
    this.choices = [...initialChoices];
  }

  addChoices(choices: Choice[]) {
    this.choices.push(...choices);
  }

  async findByQuestionId(questionId: string): Promise<readonly Choice[]> {
    return this.choices.filter(c => c.questionId === questionId);
  }

  async findCorrectByQuestionId(questionId: string): Promise<Choice | null> {
    return this.choices.find(c => c.questionId === questionId && c.isCorrect) ?? null;
  }
}

/**
 * Fake AttemptRepository for testing
 */
export class FakeAttemptRepository implements AttemptRepository {
  public savedAttempts: Attempt[] = [];

  async create(input: CreateAttemptInput): Promise<Attempt> {
    const attempt: Attempt = {
      id: `attempt-${this.savedAttempts.length + 1}`,
      ...input,
      answeredAt: new Date(),
    };
    this.savedAttempts.push(attempt);
    return attempt;
  }

  async findByUser(userId: string, limit = 100): Promise<readonly Attempt[]> {
    return this.savedAttempts.filter(a => a.userId === userId).slice(0, limit);
  }

  async findBySession(sessionId: string): Promise<readonly Attempt[]> {
    return this.savedAttempts.filter(a => a.practiceSessionId === sessionId);
  }

  async countByUser(userId: string): Promise<number> {
    return this.savedAttempts.filter(a => a.userId === userId).length;
  }

  async countCorrectByUser(userId: string): Promise<number> {
    return this.savedAttempts.filter(a => a.userId === userId && a.isCorrect).length;
  }
}

/**
 * Fake SubscriptionRepository for testing
 */
export class FakeSubscriptionRepository implements SubscriptionRepository {
  private subscriptions: Map<string, Subscription> = new Map();

  setSubscription(userId: string, sub: Subscription) {
    this.subscriptions.set(userId, sub);
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.subscriptions.get(userId) ?? null;
  }

  async upsert(userId: string, data: any): Promise<Subscription> {
    const sub: Subscription = { id: `sub-${userId}`, userId, ...data, createdAt: new Date(), updatedAt: new Date() };
    this.subscriptions.set(userId, sub);
    return sub;
  }

  async updateStatus(userId: string, status: string): Promise<void> {
    const sub = this.subscriptions.get(userId);
    if (sub) {
      this.subscriptions.set(userId, { ...sub, status: status as any });
    }
  }
}
```

### File: `src/application/use-cases/submit-answer.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SubmitAnswerUseCase } from './submit-answer';
import { FakeQuestionRepository, FakeChoiceRepository, FakeAttemptRepository, FakeSubscriptionRepository } from '../test-helpers/fakes';
import type { Question, Choice } from '@/src/domain/entities';

describe('SubmitAnswerUseCase', () => {
  let questionRepo: FakeQuestionRepository;
  let choiceRepo: FakeChoiceRepository;
  let attemptRepo: FakeAttemptRepository;
  let subscriptionRepo: FakeSubscriptionRepository;
  let useCase: SubmitAnswerUseCase;

  const question: Question = {
    id: 'q1',
    slug: 'test-question',
    stemMd: 'What is 2+2?',
    explanationMd: '2+2=4',
    difficulty: 'easy',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const choices: Choice[] = [
    { id: 'c1', questionId: 'q1', label: 'A', textMd: '3', isCorrect: false, sortOrder: 1 },
    { id: 'c2', questionId: 'q1', label: 'B', textMd: '4', isCorrect: true, sortOrder: 2 },
    { id: 'c3', questionId: 'q1', label: 'C', textMd: '5', isCorrect: false, sortOrder: 3 },
  ];

  beforeEach(() => {
    questionRepo = new FakeQuestionRepository();
    questionRepo.addQuestion(question, choices);

    choiceRepo = new FakeChoiceRepository(choices);
    attemptRepo = new FakeAttemptRepository();
    subscriptionRepo = new FakeSubscriptionRepository();

    // Set up active subscription
    subscriptionRepo.setSubscription('user1', {
      id: 'sub1',
      userId: 'user1',
      stripeSubscriptionId: 'stripe_sub',
      status: 'active',
      priceId: 'price_123',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    useCase = new SubmitAnswerUseCase(questionRepo, choiceRepo, attemptRepo, subscriptionRepo);
  });

  it('records correct answer attempt', async () => {
    const result = await useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: 'c2', // correct
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctChoiceId).toBe('c2');
    expect(attemptRepo.savedAttempts).toHaveLength(1);
    expect(attemptRepo.savedAttempts[0].isCorrect).toBe(true);
  });

  it('records incorrect answer attempt', async () => {
    const result = await useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: 'c1', // incorrect
    });

    expect(result.isCorrect).toBe(false);
    expect(result.correctChoiceId).toBe('c2');
    expect(attemptRepo.savedAttempts[0].isCorrect).toBe(false);
  });

  it('returns explanation', async () => {
    const result = await useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: 'c1',
    });

    expect(result.explanationMd).toBe('2+2=4');
  });

  it('throws NOT_FOUND for missing question', async () => {
    await expect(useCase.execute({
      userId: 'user1',
      questionId: 'nonexistent',
      choiceId: 'c1',
    })).rejects.toThrow('NOT_FOUND');
  });

  it('throws NOT_FOUND for missing choice', async () => {
    await expect(useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: 'nonexistent',
    })).rejects.toThrow('NOT_FOUND');
  });

  it('throws UNSUBSCRIBED without active subscription', async () => {
    subscriptionRepo.setSubscription('user1', {
      ...await subscriptionRepo.findByUserId('user1')!,
      status: 'canceled',
    } as any);

    await expect(useCase.execute({
      userId: 'user1',
      questionId: 'q1',
      choiceId: 'c1',
    })).rejects.toThrow('UNSUBSCRIBED');
  });
});
```

### File: `src/application/use-cases/check-entitlement.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CheckEntitlementUseCase } from './check-entitlement';
import { FakeSubscriptionRepository } from '../test-helpers/fakes';

describe('CheckEntitlementUseCase', () => {
  let subscriptionRepo: FakeSubscriptionRepository;
  let useCase: CheckEntitlementUseCase;

  beforeEach(() => {
    subscriptionRepo = new FakeSubscriptionRepository();
    useCase = new CheckEntitlementUseCase(subscriptionRepo);
  });

  it('returns true for active subscription', async () => {
    subscriptionRepo.setSubscription('user1', {
      id: 'sub1',
      userId: 'user1',
      stripeSubscriptionId: 'stripe_sub',
      status: 'active',
      priceId: 'price_123',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await useCase.execute('user1');
    expect(result.isEntitled).toBe(true);
  });

  it('returns false for canceled subscription', async () => {
    subscriptionRepo.setSubscription('user1', {
      id: 'sub1',
      userId: 'user1',
      stripeSubscriptionId: 'stripe_sub',
      status: 'canceled',
      priceId: 'price_123',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await useCase.execute('user1');
    expect(result.isEntitled).toBe(false);
  });

  it('returns false for no subscription', async () => {
    const result = await useCase.execute('user1');
    expect(result.isEntitled).toBe(false);
  });

  it('returns false for expired subscription', async () => {
    subscriptionRepo.setSubscription('user1', {
      id: 'sub1',
      userId: 'user1',
      stripeSubscriptionId: 'stripe_sub',
      status: 'active',
      priceId: 'price_123',
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await useCase.execute('user1');
    expect(result.isEntitled).toBe(false);
  });
});
```

---

## Implementation

### File: `src/application/use-cases/submit-answer.ts`

```typescript
import type { QuestionRepository, ChoiceRepository, AttemptRepository, SubscriptionRepository } from '../ports';
import { gradeAnswer } from '@/src/domain/services';
import { isEntitled } from '@/src/domain/services';
import { Errors } from '../errors/application-errors';

export type SubmitAnswerInput = {
  userId: string;
  questionId: string;
  choiceId: string;
  sessionId?: string;
};

export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  correctLabel: string;
  explanationMd: string;
};

export class SubmitAnswerUseCase {
  constructor(
    private readonly questionRepo: QuestionRepository,
    private readonly choiceRepo: ChoiceRepository,
    private readonly attemptRepo: AttemptRepository,
    private readonly subscriptionRepo: SubscriptionRepository
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    // Check entitlement
    const subscription = await this.subscriptionRepo.findByUserId(input.userId);
    if (!isEntitled(subscription)) {
      throw Errors.unsubscribed();
    }

    // Load question with choices
    const questionWithChoices = await this.questionRepo.findWithChoices(input.questionId);
    if (!questionWithChoices || questionWithChoices.status !== 'published') {
      throw Errors.notFound('Question');
    }

    // Verify choice belongs to question
    const selectedChoice = questionWithChoices.choices.find(c => c.id === input.choiceId);
    if (!selectedChoice) {
      throw Errors.notFound('Choice');
    }

    // Grade answer (pure domain function)
    const gradeResult = gradeAnswer(questionWithChoices, questionWithChoices.choices, input.choiceId);

    // Record attempt
    const attempt = await this.attemptRepo.create({
      userId: input.userId,
      questionId: input.questionId,
      practiceSessionId: input.sessionId ?? null,
      selectedChoiceId: input.choiceId,
      isCorrect: gradeResult.isCorrect,
      timeSpentSeconds: 0,
    });

    return {
      attemptId: attempt.id,
      isCorrect: gradeResult.isCorrect,
      correctChoiceId: gradeResult.correctChoiceId,
      correctLabel: gradeResult.correctLabel,
      explanationMd: gradeResult.explanationMd,
    };
  }
}
```

### File: `src/application/use-cases/check-entitlement.ts`

```typescript
import type { SubscriptionRepository } from '../ports';
import { isEntitled } from '@/src/domain/services';

export type CheckEntitlementOutput = {
  isEntitled: boolean;
  subscription: {
    status: string;
    periodEnd: Date;
  } | null;
};

export class CheckEntitlementUseCase {
  constructor(private readonly subscriptionRepo: SubscriptionRepository) {}

  async execute(userId: string): Promise<CheckEntitlementOutput> {
    const subscription = await this.subscriptionRepo.findByUserId(userId);

    if (!subscription) {
      return { isEntitled: false, subscription: null };
    }

    return {
      isEntitled: isEntitled(subscription),
      subscription: {
        status: subscription.status,
        periodEnd: subscription.currentPeriodEnd,
      },
    };
  }
}
```

### File: `src/application/use-cases/get-next-question.ts`

```typescript
import type { QuestionRepository, AttemptRepository, SubscriptionRepository, QuestionFilters } from '../ports';
import { isEntitled } from '@/src/domain/services';
import { Errors } from '../errors/application-errors';

export type GetNextQuestionInput = {
  userId: string;
  filters?: {
    tagSlugs?: string[];
    difficulties?: ('easy' | 'medium' | 'hard')[];
  };
};

export type PublicChoice = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
  // NOTE: isCorrect is NOT included
};

export type GetNextQuestionOutput = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: PublicChoice[];
} | null;

export class GetNextQuestionUseCase {
  constructor(
    private readonly questionRepo: QuestionRepository,
    private readonly attemptRepo: AttemptRepository,
    private readonly subscriptionRepo: SubscriptionRepository
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    // Check entitlement
    const subscription = await this.subscriptionRepo.findByUserId(input.userId);
    if (!isEntitled(subscription)) {
      throw Errors.unsubscribed();
    }

    // Get user's attempted questions
    const attempts = await this.attemptRepo.findByUser(input.userId, 10000);
    const attemptedIds = [...new Set(attempts.map(a => a.questionId))];

    // Build filters
    const filters: QuestionFilters = {
      excludeIds: attemptedIds,
      difficulties: input.filters?.difficulties,
      tagSlugs: input.filters?.tagSlugs,
    };

    // Find unanswered question
    const questions = await this.questionRepo.findPublishedByFilters(filters, 1);

    if (questions.length === 0) {
      // All answered - return oldest attempted
      // For MVP, just return null
      return null;
    }

    const question = questions[0];
    const withChoices = await this.questionRepo.findWithChoices(question.id);

    if (!withChoices) {
      return null;
    }

    return {
      questionId: withChoices.id,
      slug: withChoices.slug,
      stemMd: withChoices.stemMd,
      difficulty: withChoices.difficulty,
      choices: withChoices.choices.map(c => ({
        id: c.id,
        label: c.label,
        textMd: c.textMd,
        sortOrder: c.sortOrder,
      })),
    };
  }
}
```

### File: `src/application/use-cases/index.ts`

```typescript
export { SubmitAnswerUseCase, type SubmitAnswerInput, type SubmitAnswerOutput } from './submit-answer';
export { CheckEntitlementUseCase, type CheckEntitlementOutput } from './check-entitlement';
export { GetNextQuestionUseCase, type GetNextQuestionInput, type GetNextQuestionOutput, type PublicChoice } from './get-next-question';
```

---

## Quality Gate

```bash
pnpm test src/application/use-cases/
```

---

## Definition of Done

- [ ] Use cases orchestrate domain services and repositories
- [ ] Tests use Fakes, NOT mocks
- [ ] Entitlement checked before all operations
- [ ] Proper error throwing with ApplicationError
- [ ] PublicChoice excludes isCorrect
- [ ] All tests pass
