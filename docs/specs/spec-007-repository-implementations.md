# SPEC-007: Repository Implementations

**Status:** Ready
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports), SPEC-006 (Schema)
**Implements:** ADR-001, ADR-003

---

## Objective

Implement repository interfaces using Drizzle ORM. These are **Adapter** classes that bridge the Application layer's abstract ports to the concrete database.

---

## Files to Create

```
src/adapters/repositories/
├── drizzle-user-repository.ts
├── drizzle-user-repository.test.ts
├── drizzle-question-repository.ts
├── drizzle-question-repository.test.ts
├── drizzle-attempt-repository.ts
├── drizzle-attempt-repository.test.ts
├── drizzle-subscription-repository.ts
├── drizzle-subscription-repository.test.ts
├── drizzle-session-repository.ts
├── drizzle-session-repository.test.ts
├── drizzle-bookmark-repository.ts
├── drizzle-bookmark-repository.test.ts
├── drizzle-tag-repository.ts
├── drizzle-tag-repository.test.ts
└── index.ts
```

---

## Design Pattern: Adapter

```
┌─────────────────────────────────────────────────┐
│         APPLICATION LAYER (ports)               │
│                                                 │
│   UserRepository (interface)                    │
│   QuestionRepository (interface)                │
│                                                 │
└─────────────────────────────────────────────────┘
                    ▲
                    │ implements
                    │
┌─────────────────────────────────────────────────┐
│         ADAPTERS LAYER                          │
│                                                 │
│   DrizzleUserRepository (class)                 │
│   DrizzleQuestionRepository (class)             │
│   - constructor(db: DrizzleClient)              │
│   - maps DB rows ↔ domain entities              │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Test Strategy: Integration Tests with Test DB

Per ADR-003, repository tests run against a real PostgreSQL database (test container or separate test DB). These are integration tests, not unit tests.

---

## Test First

### File: `src/adapters/repositories/drizzle-user-repository.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { createTestDb, cleanupTestDb } from '@/test/helpers/test-db';
import type { DrizzleClient } from '@/lib/db';

describe('DrizzleUserRepository', () => {
  let db: DrizzleClient;
  let repo: DrizzleUserRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repo = new DrizzleUserRepository(db);
    await cleanupTestDb(db); // Clear tables between tests
  });

  afterAll(async () => {
    // Close connection if needed
  });

  describe('upsertByClerkId', () => {
    it('creates new user when not exists', async () => {
      const user = await repo.upsertByClerkId('clerk_123', 'test@example.com');

      expect(user.id).toBeDefined();
      expect(user.clerkUserId).toBe('clerk_123');
      expect(user.email).toBe('test@example.com');
    });

    it('returns existing user when already exists', async () => {
      const first = await repo.upsertByClerkId('clerk_123', 'test@example.com');
      const second = await repo.upsertByClerkId('clerk_123', 'test@example.com');

      expect(second.id).toBe(first.id);
    });

    it('updates email if changed', async () => {
      await repo.upsertByClerkId('clerk_123', 'old@example.com');
      const updated = await repo.upsertByClerkId('clerk_123', 'new@example.com');

      expect(updated.email).toBe('new@example.com');
    });
  });

  describe('findByClerkId', () => {
    it('returns null when user not found', async () => {
      const result = await repo.findByClerkId('nonexistent');
      expect(result).toBeNull();
    });

    it('returns user when found', async () => {
      await repo.upsertByClerkId('clerk_123', 'test@example.com');
      const user = await repo.findByClerkId('clerk_123');

      expect(user).not.toBeNull();
      expect(user?.clerkUserId).toBe('clerk_123');
    });
  });

  describe('findById', () => {
    it('returns null when user not found', async () => {
      const result = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('returns user when found', async () => {
      const created = await repo.upsertByClerkId('clerk_123', 'test@example.com');
      const user = await repo.findById(created.id);

      expect(user).not.toBeNull();
      expect(user?.id).toBe(created.id);
    });
  });
});
```

### File: `src/adapters/repositories/drizzle-question-repository.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DrizzleQuestionRepository } from './drizzle-question-repository';
import { createTestDb, cleanupTestDb, seedQuestion } from '@/test/helpers/test-db';
import type { DrizzleClient } from '@/lib/db';

describe('DrizzleQuestionRepository', () => {
  let db: DrizzleClient;
  let repo: DrizzleQuestionRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repo = new DrizzleQuestionRepository(db);
    await cleanupTestDb(db);
  });

  describe('findById', () => {
    it('returns null when question not found', async () => {
      const result = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('returns question when found', async () => {
      const seeded = await seedQuestion(db, {
        slug: 'test-question',
        status: 'published',
      });

      const question = await repo.findById(seeded.id);

      expect(question).not.toBeNull();
      expect(question?.slug).toBe('test-question');
    });
  });

  describe('findBySlug', () => {
    it('returns question by slug', async () => {
      await seedQuestion(db, { slug: 'unique-slug' });

      const question = await repo.findBySlug('unique-slug');

      expect(question).not.toBeNull();
      expect(question?.slug).toBe('unique-slug');
    });
  });

  describe('findPublished', () => {
    it('returns only published questions', async () => {
      await seedQuestion(db, { slug: 'q1', status: 'published' });
      await seedQuestion(db, { slug: 'q2', status: 'draft' });
      await seedQuestion(db, { slug: 'q3', status: 'published' });

      const questions = await repo.findPublished();

      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.status === 'published')).toBe(true);
    });

    it('respects limit parameter', async () => {
      await seedQuestion(db, { slug: 'q1', status: 'published' });
      await seedQuestion(db, { slug: 'q2', status: 'published' });
      await seedQuestion(db, { slug: 'q3', status: 'published' });

      const questions = await repo.findPublished(2);

      expect(questions).toHaveLength(2);
    });
  });

  describe('findPublishedByFilters', () => {
    it('filters by difficulty', async () => {
      await seedQuestion(db, { slug: 'q1', status: 'published', difficulty: 'easy' });
      await seedQuestion(db, { slug: 'q2', status: 'published', difficulty: 'hard' });

      const questions = await repo.findPublishedByFilters({
        difficulties: ['easy'],
      });

      expect(questions).toHaveLength(1);
      expect(questions[0].difficulty).toBe('easy');
    });

    it('excludes specified IDs', async () => {
      const q1 = await seedQuestion(db, { slug: 'q1', status: 'published' });
      await seedQuestion(db, { slug: 'q2', status: 'published' });

      const questions = await repo.findPublishedByFilters({
        excludeIds: [q1.id],
      });

      expect(questions).toHaveLength(1);
      expect(questions[0].slug).toBe('q2');
    });
  });

  describe('findWithChoices', () => {
    it('returns question with choices array', async () => {
      const seeded = await seedQuestion(db, {
        slug: 'q-with-choices',
        status: 'published',
        choices: [
          { label: 'A', textMd: 'Option A', isCorrect: false },
          { label: 'B', textMd: 'Option B', isCorrect: true },
        ],
      });

      const result = await repo.findWithChoices(seeded.id);

      expect(result).not.toBeNull();
      expect(result?.choices).toHaveLength(2);
      expect(result?.choices.find(c => c.isCorrect)?.label).toBe('B');
    });
  });
});
```

### File: `src/adapters/repositories/drizzle-attempt-repository.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DrizzleAttemptRepository } from './drizzle-attempt-repository';
import { createTestDb, cleanupTestDb, seedUser, seedQuestion } from '@/test/helpers/test-db';
import type { DrizzleClient } from '@/lib/db';

describe('DrizzleAttemptRepository', () => {
  let db: DrizzleClient;
  let repo: DrizzleAttemptRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repo = new DrizzleAttemptRepository(db);
    await cleanupTestDb(db);
  });

  describe('create', () => {
    it('creates an attempt record', async () => {
      const user = await seedUser(db);
      const question = await seedQuestion(db, { status: 'published' });

      const attempt = await repo.create({
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: null,
        isCorrect: true,
        timeSpentSeconds: 30,
      });

      expect(attempt.id).toBeDefined();
      expect(attempt.userId).toBe(user.id);
      expect(attempt.isCorrect).toBe(true);
    });
  });

  describe('findByUser', () => {
    it('returns attempts for user', async () => {
      const user = await seedUser(db);
      const question = await seedQuestion(db, { status: 'published' });

      await repo.create({
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: null,
        isCorrect: true,
        timeSpentSeconds: 30,
      });

      const attempts = await repo.findByUser(user.id);

      expect(attempts).toHaveLength(1);
    });
  });

  describe('countByUser', () => {
    it('counts total attempts for user', async () => {
      const user = await seedUser(db);
      const q1 = await seedQuestion(db, { slug: 'q1', status: 'published' });
      const q2 = await seedQuestion(db, { slug: 'q2', status: 'published' });

      await repo.create({ userId: user.id, questionId: q1.id, practiceSessionId: null, selectedChoiceId: null, isCorrect: true, timeSpentSeconds: 10 });
      await repo.create({ userId: user.id, questionId: q2.id, practiceSessionId: null, selectedChoiceId: null, isCorrect: false, timeSpentSeconds: 20 });

      const count = await repo.countByUser(user.id);

      expect(count).toBe(2);
    });
  });

  describe('countCorrectByUser', () => {
    it('counts only correct attempts', async () => {
      const user = await seedUser(db);
      const q1 = await seedQuestion(db, { slug: 'q1', status: 'published' });
      const q2 = await seedQuestion(db, { slug: 'q2', status: 'published' });

      await repo.create({ userId: user.id, questionId: q1.id, practiceSessionId: null, selectedChoiceId: null, isCorrect: true, timeSpentSeconds: 10 });
      await repo.create({ userId: user.id, questionId: q2.id, practiceSessionId: null, selectedChoiceId: null, isCorrect: false, timeSpentSeconds: 20 });

      const count = await repo.countCorrectByUser(user.id);

      expect(count).toBe(1);
    });
  });
});
```

---

## Implementation

### File: `src/adapters/repositories/drizzle-user-repository.ts`

```typescript
import { eq } from 'drizzle-orm';
import type { DrizzleClient } from '@/lib/db';
import { users } from '@/db/schema';
import type { UserRepository } from '@/src/application/ports';
import type { User } from '@/src/domain/entities';

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async findByClerkId(clerkUserId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    return rows[0] ?? null;
  }

  async upsertByClerkId(clerkUserId: string, email: string): Promise<User> {
    const existing = await this.findByClerkId(clerkUserId);

    if (existing) {
      if (existing.email !== email) {
        await this.db
          .update(users)
          .set({ email, updatedAt: new Date() })
          .where(eq(users.id, existing.id));

        return { ...existing, email };
      }
      return existing;
    }

    const [created] = await this.db
      .insert(users)
      .values({ clerkUserId, email })
      .returning();

    return created;
  }
}
```

### File: `src/adapters/repositories/drizzle-question-repository.ts`

```typescript
import { eq, and, inArray, notInArray, desc } from 'drizzle-orm';
import type { DrizzleClient } from '@/lib/db';
import { questions, choices, questionTags, tags } from '@/db/schema';
import type { QuestionRepository, QuestionWithChoices, QuestionFilters } from '@/src/application/ports';
import type { Question } from '@/src/domain/entities';

export class DrizzleQuestionRepository implements QuestionRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: string): Promise<Question | null> {
    const rows = await this.db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async findBySlug(slug: string): Promise<Question | null> {
    const rows = await this.db
      .select()
      .from(questions)
      .where(eq(questions.slug, slug))
      .limit(1);

    return rows[0] ?? null;
  }

  async findPublished(limit?: number): Promise<readonly Question[]> {
    let query = this.db
      .select()
      .from(questions)
      .where(eq(questions.status, 'published'))
      .orderBy(desc(questions.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  }

  async findPublishedByFilters(
    filters: QuestionFilters,
    limit?: number
  ): Promise<readonly Question[]> {
    const conditions = [eq(questions.status, 'published')];

    if (filters.difficulties && filters.difficulties.length > 0) {
      conditions.push(inArray(questions.difficulty, filters.difficulties as string[]));
    }

    if (filters.excludeIds && filters.excludeIds.length > 0) {
      conditions.push(notInArray(questions.id, filters.excludeIds as string[]));
    }

    let query = this.db
      .select()
      .from(questions)
      .where(and(...conditions))
      .orderBy(desc(questions.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    // Handle tag filtering if needed
    if (filters.tagSlugs && filters.tagSlugs.length > 0) {
      const questionIdsWithTags = await this.db
        .select({ questionId: questionTags.questionId })
        .from(questionTags)
        .innerJoin(tags, eq(tags.id, questionTags.tagId))
        .where(inArray(tags.slug, filters.tagSlugs as string[]));

      const validIds = questionIdsWithTags.map(r => r.questionId);

      if (validIds.length === 0) return [];

      conditions.push(inArray(questions.id, validIds));

      query = this.db
        .select()
        .from(questions)
        .where(and(...conditions))
        .orderBy(desc(questions.createdAt));

      if (limit) {
        query = query.limit(limit) as typeof query;
      }
    }

    return query;
  }

  async findWithChoices(questionId: string): Promise<QuestionWithChoices | null> {
    const question = await this.findById(questionId);
    if (!question) return null;

    const questionChoices = await this.db
      .select()
      .from(choices)
      .where(eq(choices.questionId, questionId))
      .orderBy(choices.sortOrder);

    return {
      ...question,
      choices: questionChoices,
    };
  }
}
```

### File: `src/adapters/repositories/drizzle-attempt-repository.ts`

```typescript
import { eq, and, desc, count } from 'drizzle-orm';
import type { DrizzleClient } from '@/lib/db';
import { attempts } from '@/db/schema';
import type { AttemptRepository, CreateAttemptInput } from '@/src/application/ports';
import type { Attempt } from '@/src/domain/entities';

export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DrizzleClient) {}

  async create(input: CreateAttemptInput): Promise<Attempt> {
    const [attempt] = await this.db
      .insert(attempts)
      .values({
        userId: input.userId,
        questionId: input.questionId,
        practiceSessionId: input.practiceSessionId,
        selectedChoiceId: input.selectedChoiceId,
        isCorrect: input.isCorrect,
        timeSpentSeconds: input.timeSpentSeconds,
      })
      .returning();

    return attempt;
  }

  async findByUser(userId: string, limit?: number): Promise<readonly Attempt[]> {
    let query = this.db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .orderBy(desc(attempts.answeredAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  }

  async findBySession(sessionId: string): Promise<readonly Attempt[]> {
    return this.db
      .select()
      .from(attempts)
      .where(eq(attempts.practiceSessionId, sessionId))
      .orderBy(desc(attempts.answeredAt));
  }

  async countByUser(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(attempts)
      .where(eq(attempts.userId, userId));

    return result?.count ?? 0;
  }

  async countCorrectByUser(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.isCorrect, true)));

    return result?.count ?? 0;
  }
}
```

### File: `src/adapters/repositories/index.ts`

```typescript
export { DrizzleUserRepository } from './drizzle-user-repository';
export { DrizzleQuestionRepository } from './drizzle-question-repository';
export { DrizzleAttemptRepository } from './drizzle-attempt-repository';
export { DrizzleSubscriptionRepository } from './drizzle-subscription-repository';
export { DrizzleSessionRepository } from './drizzle-session-repository';
export { DrizzleBookmarkRepository } from './drizzle-bookmark-repository';
export { DrizzleTagRepository } from './drizzle-tag-repository';
```

---

## Quality Gate

```bash
pnpm test src/adapters/repositories/
```

---

## Definition of Done

- [ ] All repository interfaces implemented
- [ ] Integration tests with test database
- [ ] Proper mapping from DB rows to domain entities
- [ ] Constructor injection of DrizzleClient
- [ ] All tests pass
- [ ] Barrel export in index.ts
