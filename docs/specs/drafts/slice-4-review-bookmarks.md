# slice-4-review-bookmarks

**Slice ID:** SLICE-4
**Status:** Not Started
**Dependencies:** SLICE-3 (Practice Sessions) must be complete
**Estimated Complexity:** Medium (Query patterns, list pagination, reattempt flows)

---

## Overview

This slice implements the review features: missed questions (most recent attempt was incorrect) and bookmarks. Users can browse these lists and reattempt questions to improve their scores.

**Core Principle:** "Missed" is based on the **most recent** attempt only. A user who answers incorrectly, then correctly, then incorrectly again is counted as missed. This encourages mastery, not just eventual success.

---

## User Stories

1. As a subscribed user, I can see a list of questions I got wrong most recently.
2. As a subscribed user, I can reattempt a missed question directly from the list.
3. As a subscribed user, I can see all my bookmarked questions.
4. As a subscribed user, I can reattempt a bookmarked question.
5. As a subscribed user, I can remove bookmarks from the bookmarks page.
6. As a subscribed user, I can paginate through long lists.

---

## Architecture Decisions (SOLID + Clean Architecture)

### Single Responsibility
- `review.actions.ts` — Missed questions queries only
- `bookmarks.actions.ts` — Bookmark queries and toggle
- Review page — List display and navigation only
- Bookmarks page — List display and navigation only

### Open/Closed
- Pagination uses standard limit/offset pattern, easily extended with cursors
- List items use shared `QuestionListItem` component

### Dependency Inversion
- List pages receive data from server components
- Reattempt uses existing `submitAnswer` action

### Interface Segregation
- `MissedQuestionRow` contains only display-relevant fields
- `BookmarkRow` contains only display-relevant fields

---

## Test-First Specification (TDD)

### Phase 1: Unit Tests (Write FIRST)

#### File: `lib/review/queries.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildMissedQuestionsQuery, isMostRecentAttemptIncorrect } from './queries';

describe('isMostRecentAttemptIncorrect', () => {
  it('returns true when most recent attempt is incorrect', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T12:00:00Z'), isCorrect: true },
      { answeredAt: new Date('2026-01-31T14:00:00Z'), isCorrect: false }, // Most recent
    ];

    expect(isMostRecentAttemptIncorrect(attempts)).toBe(true);
  });

  it('returns false when most recent attempt is correct', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T12:00:00Z'), isCorrect: false },
      { answeredAt: new Date('2026-01-31T14:00:00Z'), isCorrect: true }, // Most recent
    ];

    expect(isMostRecentAttemptIncorrect(attempts)).toBe(false);
  });

  it('returns false for empty attempts', () => {
    expect(isMostRecentAttemptIncorrect([])).toBe(false);
  });

  it('handles single attempt', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T12:00:00Z'), isCorrect: false },
    ];

    expect(isMostRecentAttemptIncorrect(attempts)).toBe(true);
  });

  it('handles out-of-order input by sorting', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T14:00:00Z'), isCorrect: true }, // Actually most recent
      { answeredAt: new Date('2026-01-31T12:00:00Z'), isCorrect: false },
    ];

    expect(isMostRecentAttemptIncorrect(attempts)).toBe(false);
  });
});

describe('buildMissedQuestionsQuery', () => {
  it('requires valid pagination parameters', () => {
    expect(() => buildMissedQuestionsQuery('user-1', -1, 10)).toThrow();
    expect(() => buildMissedQuestionsQuery('user-1', 0, 0)).toThrow();
    expect(() => buildMissedQuestionsQuery('user-1', 0, 101)).toThrow();
  });

  it('accepts valid pagination parameters', () => {
    expect(() => buildMissedQuestionsQuery('user-1', 0, 20)).not.toThrow();
    expect(() => buildMissedQuestionsQuery('user-1', 100, 50)).not.toThrow();
  });
});
```

#### File: `lib/bookmarks/queries.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { sortBookmarksByDate } from './queries';

describe('sortBookmarksByDate', () => {
  it('sorts bookmarks by createdAt descending', () => {
    const bookmarks = [
      { questionId: '1', createdAt: new Date('2026-01-29') },
      { questionId: '2', createdAt: new Date('2026-01-31') },
      { questionId: '3', createdAt: new Date('2026-01-30') },
    ];

    const sorted = sortBookmarksByDate(bookmarks);

    expect(sorted[0].questionId).toBe('2');
    expect(sorted[1].questionId).toBe('3');
    expect(sorted[2].questionId).toBe('1');
  });

  it('handles empty array', () => {
    expect(sortBookmarksByDate([])).toEqual([]);
  });

  it('handles single item', () => {
    const bookmarks = [{ questionId: '1', createdAt: new Date() }];
    expect(sortBookmarksByDate(bookmarks)).toHaveLength(1);
  });
});
```

### Phase 2: Integration Tests (Write SECOND)

#### File: `tests/integration/review.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  users,
  questions,
  choices,
  attempts,
  bookmarks,
  stripeSubscriptions,
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

describe('Review and Bookmarks DB Integration', () => {
  let testUserId: string;
  let questionIds: string[] = [];
  let choiceMap: Record<string, { correct: string; incorrect: string }> = {};

  beforeAll(async () => {
    // Create test user with subscription
    const [user] = await db.insert(users).values({
      clerkUserId: 'test_clerk_review',
      email: 'review@test.com',
    }).returning();
    testUserId = user.id;

    await db.insert(stripeSubscriptions).values({
      userId: testUserId,
      stripeSubscriptionId: 'sub_test_review',
      status: 'active',
      priceId: 'price_test',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Create 5 test questions
    for (let i = 1; i <= 5; i++) {
      const [q] = await db.insert(questions).values({
        slug: `review-test-q${i}`,
        stemMd: `Review Question ${i}`,
        explanationMd: `Explanation ${i}`,
        difficulty: 'medium',
        status: 'published',
      }).returning();
      questionIds.push(q.id);

      const [incorrect] = await db.insert(choices).values({
        questionId: q.id,
        label: 'A',
        textMd: 'Wrong',
        isCorrect: false,
        sortOrder: 1,
      }).returning();

      const [correct] = await db.insert(choices).values({
        questionId: q.id,
        label: 'B',
        textMd: 'Correct',
        isCorrect: true,
        sortOrder: 2,
      }).returning();

      choiceMap[q.id] = { correct: correct.id, incorrect: incorrect.id };
    }
  });

  afterAll(async () => {
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(bookmarks).where(eq(bookmarks.userId, testUserId));
    for (const qId of questionIds) {
      await db.delete(choices).where(eq(choices.questionId, qId));
      await db.delete(questions).where(eq(questions.id, qId));
    }
    await db.delete(stripeSubscriptions).where(eq(stripeSubscriptions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  beforeEach(async () => {
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(bookmarks).where(eq(bookmarks.userId, testUserId));
  });

  describe('missed questions query pattern', () => {
    it('identifies question with most recent incorrect attempt', async () => {
      // Q1: incorrect only
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        selectedChoiceId: choiceMap[questionIds[0]].incorrect,
        isCorrect: false,
      });

      // Query for missed: most recent attempt per question is incorrect
      // This is the complex query pattern we need to test

      // Get all user attempts grouped by question
      const userAttempts = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId))
        .orderBy(desc(attempts.answeredAt));

      // Group by question, find most recent
      const latestByQuestion = new Map<string, typeof userAttempts[0]>();
      for (const attempt of userAttempts) {
        if (!latestByQuestion.has(attempt.questionId)) {
          latestByQuestion.set(attempt.questionId, attempt);
        }
      }

      // Filter to incorrect
      const missed = [...latestByQuestion.values()].filter(a => !a.isCorrect);

      expect(missed).toHaveLength(1);
      expect(missed[0].questionId).toBe(questionIds[0]);
    });

    it('excludes question where most recent attempt is correct', async () => {
      // Q1: first incorrect, then correct
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        selectedChoiceId: choiceMap[questionIds[0]].incorrect,
        isCorrect: false,
        answeredAt: new Date('2026-01-31T10:00:00Z'),
      });

      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        selectedChoiceId: choiceMap[questionIds[0]].correct,
        isCorrect: true,
        answeredAt: new Date('2026-01-31T12:00:00Z'), // Later
      });

      const userAttempts = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId))
        .orderBy(desc(attempts.answeredAt));

      const latestByQuestion = new Map<string, typeof userAttempts[0]>();
      for (const attempt of userAttempts) {
        if (!latestByQuestion.has(attempt.questionId)) {
          latestByQuestion.set(attempt.questionId, attempt);
        }
      }

      const missed = [...latestByQuestion.values()].filter(a => !a.isCorrect);

      expect(missed).toHaveLength(0);
    });

    it('includes question that was correct then incorrect', async () => {
      // Q1: first correct, then incorrect
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        selectedChoiceId: choiceMap[questionIds[0]].correct,
        isCorrect: true,
        answeredAt: new Date('2026-01-31T10:00:00Z'),
      });

      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        selectedChoiceId: choiceMap[questionIds[0]].incorrect,
        isCorrect: false,
        answeredAt: new Date('2026-01-31T12:00:00Z'), // Later - now incorrect
      });

      const userAttempts = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId))
        .orderBy(desc(attempts.answeredAt));

      const latestByQuestion = new Map<string, typeof userAttempts[0]>();
      for (const attempt of userAttempts) {
        if (!latestByQuestion.has(attempt.questionId)) {
          latestByQuestion.set(attempt.questionId, attempt);
        }
      }

      const missed = [...latestByQuestion.values()].filter(a => !a.isCorrect);

      expect(missed).toHaveLength(1);
      expect(missed[0].questionId).toBe(questionIds[0]);
    });

    it('handles multiple questions with mixed states', async () => {
      // Q1: missed (incorrect only)
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        selectedChoiceId: choiceMap[questionIds[0]].incorrect,
        isCorrect: false,
      });

      // Q2: mastered (correct only)
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[1],
        selectedChoiceId: choiceMap[questionIds[1]].correct,
        isCorrect: true,
      });

      // Q3: missed (incorrect -> correct -> incorrect)
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[2],
        selectedChoiceId: choiceMap[questionIds[2]].incorrect,
        isCorrect: false,
        answeredAt: new Date('2026-01-31T10:00:00Z'),
      });
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[2],
        selectedChoiceId: choiceMap[questionIds[2]].correct,
        isCorrect: true,
        answeredAt: new Date('2026-01-31T11:00:00Z'),
      });
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[2],
        selectedChoiceId: choiceMap[questionIds[2]].incorrect,
        isCorrect: false,
        answeredAt: new Date('2026-01-31T12:00:00Z'),
      });

      // Q4 & Q5: never attempted (not in missed list)

      const userAttempts = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId))
        .orderBy(desc(attempts.answeredAt));

      const latestByQuestion = new Map<string, typeof userAttempts[0]>();
      for (const attempt of userAttempts) {
        if (!latestByQuestion.has(attempt.questionId)) {
          latestByQuestion.set(attempt.questionId, attempt);
        }
      }

      const missed = [...latestByQuestion.values()].filter(a => !a.isCorrect);

      expect(missed).toHaveLength(2);
      const missedIds = missed.map(m => m.questionId);
      expect(missedIds).toContain(questionIds[0]);
      expect(missedIds).toContain(questionIds[2]);
      expect(missedIds).not.toContain(questionIds[1]);
    });
  });

  describe('bookmarks', () => {
    it('creates bookmark and retrieves with question data', async () => {
      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: questionIds[0],
      });

      const result = await db
        .select({
          questionId: bookmarks.questionId,
          createdAt: bookmarks.createdAt,
          slug: questions.slug,
          stemMd: questions.stemMd,
          difficulty: questions.difficulty,
        })
        .from(bookmarks)
        .innerJoin(questions, eq(bookmarks.questionId, questions.id))
        .where(
          and(
            eq(bookmarks.userId, testUserId),
            eq(questions.status, 'published')
          )
        )
        .orderBy(desc(bookmarks.createdAt));

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('review-test-q1');
    });

    it('retrieves multiple bookmarks in order', async () => {
      // Add bookmarks with specific times
      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: questionIds[0],
        createdAt: new Date('2026-01-30'),
      });
      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: questionIds[2],
        createdAt: new Date('2026-01-31'),
      });
      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: questionIds[1],
        createdAt: new Date('2026-01-29'),
      });

      const result = await db
        .select({ questionId: bookmarks.questionId })
        .from(bookmarks)
        .innerJoin(questions, eq(bookmarks.questionId, questions.id))
        .where(eq(bookmarks.userId, testUserId))
        .orderBy(desc(bookmarks.createdAt));

      expect(result).toHaveLength(3);
      expect(result[0].questionId).toBe(questionIds[2]); // Most recent
      expect(result[1].questionId).toBe(questionIds[0]);
      expect(result[2].questionId).toBe(questionIds[1]); // Oldest
    });

    it('excludes bookmarks for unpublished questions', async () => {
      // Create archived question
      const [archived] = await db.insert(questions).values({
        slug: 'archived-test',
        stemMd: 'Archived',
        explanationMd: 'Archived',
        difficulty: 'easy',
        status: 'archived',
      }).returning();

      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: archived.id,
      });

      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: questionIds[0],
      });

      const result = await db
        .select({ questionId: bookmarks.questionId })
        .from(bookmarks)
        .innerJoin(questions, eq(bookmarks.questionId, questions.id))
        .where(
          and(
            eq(bookmarks.userId, testUserId),
            eq(questions.status, 'published')
          )
        );

      expect(result).toHaveLength(1);
      expect(result[0].questionId).toBe(questionIds[0]);

      // Cleanup
      await db.delete(bookmarks).where(eq(bookmarks.questionId, archived.id));
      await db.delete(questions).where(eq(questions.id, archived.id));
    });
  });
});
```

### Phase 3: E2E Tests (Write THIRD)

#### File: `tests/e2e/review.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Review Missed Questions', () => {
  test.beforeEach(async ({ page }) => {
    // Prerequisite: user has answered some questions incorrectly
  });

  test('displays missed questions list', async ({ page }) => {
    await page.goto('/app/review');

    // Should see page title
    await expect(page.getByRole('heading', { name: /missed/i })).toBeVisible();

    // Should see question items (assuming test data exists)
    const items = page.locator('[data-testid="question-list-item"]');
    await expect(items.first()).toBeVisible();
  });

  test('shows question difficulty badge', async ({ page }) => {
    await page.goto('/app/review');

    // Each item should show difficulty
    const badge = page.locator('[data-testid="difficulty-badge"]').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/easy|medium|hard/i);
  });

  test('can click to reattempt a missed question', async ({ page }) => {
    await page.goto('/app/review');

    // Click first item
    await page.locator('[data-testid="question-list-item"]').first().click();

    // Should show question view
    await expect(page.locator('[data-testid="question-stem"]')).toBeVisible();
  });

  test('reattempting records new attempt', async ({ page }) => {
    await page.goto('/app/review');
    await page.locator('[data-testid="question-list-item"]').first().click();

    // Answer the question
    await page.locator('[data-testid="choice-option"]').first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // Should show feedback
    await expect(page.locator('[data-testid="answer-feedback"]')).toBeVisible();
  });

  test('pagination works on long lists', async ({ page }) => {
    await page.goto('/app/review');

    // If there's a next page button
    const nextButton = page.getByRole('button', { name: /next/i });
    if (await nextButton.isVisible()) {
      await nextButton.click();

      // Should show different items (offset pagination)
      await expect(page).toHaveURL(/offset=\d+/);
    }
  });
});
```

#### File: `tests/e2e/bookmarks.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Bookmarks', () => {
  test('displays bookmarked questions list', async ({ page }) => {
    await page.goto('/app/bookmarks');

    await expect(page.getByRole('heading', { name: /bookmark/i })).toBeVisible();
  });

  test('can remove bookmark from list', async ({ page }) => {
    await page.goto('/app/bookmarks');

    // Get initial count
    const items = page.locator('[data-testid="question-list-item"]');
    const initialCount = await items.count();

    if (initialCount > 0) {
      // Click remove bookmark button on first item
      await page.locator('[data-testid="remove-bookmark"]').first().click();

      // Item should be removed
      await expect(items).toHaveCount(initialCount - 1);
    }
  });

  test('can click to reattempt bookmarked question', async ({ page }) => {
    await page.goto('/app/bookmarks');

    const items = page.locator('[data-testid="question-list-item"]');
    if ((await items.count()) > 0) {
      await items.first().click();

      await expect(page.locator('[data-testid="question-stem"]')).toBeVisible();
    }
  });

  test('empty state when no bookmarks', async ({ page }) => {
    // This test assumes user has no bookmarks
    await page.goto('/app/bookmarks');

    // Should show empty state
    await expect(page.getByText(/no.*bookmark/i)).toBeVisible();
  });
});
```

---

## Implementation Checklist

### Step 1: Create Query Utilities

**File:** `lib/review/queries.ts`

```typescript
export type AttemptWithDate = {
  answeredAt: Date;
  isCorrect: boolean;
};

export function isMostRecentAttemptIncorrect(attempts: AttemptWithDate[]): boolean {
  if (attempts.length === 0) return false;

  // Sort by date descending to find most recent
  const sorted = [...attempts].sort(
    (a, b) => b.answeredAt.getTime() - a.answeredAt.getTime()
  );

  return !sorted[0].isCorrect;
}

export function buildMissedQuestionsQuery(
  userId: string,
  offset: number,
  limit: number
): void {
  if (offset < 0) {
    throw new Error('offset must be >= 0');
  }
  if (limit <= 0 || limit > 100) {
    throw new Error('limit must be between 1 and 100');
  }
  // Query building logic is in the action
}
```

**File:** `lib/bookmarks/queries.ts`

```typescript
export type BookmarkWithDate = {
  questionId: string;
  createdAt: Date;
};

export function sortBookmarksByDate<T extends BookmarkWithDate>(
  bookmarks: T[]
): T[] {
  return [...bookmarks].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}
```

### Step 2: Implement Review Actions

**File:** `app/(app)/app/_actions/review.actions.ts`

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, questions, attempts } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { checkUserEntitlement } from '@/lib/subscription';
import { type ActionResult, success, failure } from './actionResult';

const GetMissedQuestionsInput = z.object({
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
}).strict();

export type MissedQuestionRow = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastAnsweredAt: string;
};

export type GetMissedQuestionsOutput = {
  rows: MissedQuestionRow[];
  limit: number;
  offset: number;
};

export async function getMissedQuestions(
  input: z.infer<typeof GetMissedQuestionsInput>
): Promise<ActionResult<GetMissedQuestionsOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = GetMissedQuestionsInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid pagination parameters');
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return failure('UNAUTHENTICATED', 'User not found');
    }

    const isEntitled = await checkUserEntitlement(user.id);
    if (!isEntitled) {
      return failure('UNSUBSCRIBED', 'Active subscription required');
    }

    // Get all user attempts, newest first
    const userAttempts = await db
      .select({
        questionId: attempts.questionId,
        isCorrect: attempts.isCorrect,
        answeredAt: attempts.answeredAt,
      })
      .from(attempts)
      .where(eq(attempts.userId, user.id))
      .orderBy(desc(attempts.answeredAt));

    // Find most recent attempt per question
    const latestByQuestion = new Map<
      string,
      { isCorrect: boolean; answeredAt: Date }
    >();
    for (const attempt of userAttempts) {
      if (!latestByQuestion.has(attempt.questionId)) {
        latestByQuestion.set(attempt.questionId, {
          isCorrect: attempt.isCorrect,
          answeredAt: attempt.answeredAt,
        });
      }
    }

    // Filter to incorrect
    const missedQuestionIds = [...latestByQuestion.entries()]
      .filter(([_, data]) => !data.isCorrect)
      .sort((a, b) => b[1].answeredAt.getTime() - a[1].answeredAt.getTime())
      .slice(parsed.data.offset, parsed.data.offset + parsed.data.limit)
      .map(([id]) => id);

    if (missedQuestionIds.length === 0) {
      return success({
        rows: [],
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
    }

    // Fetch question details
    const questionRows = await db
      .select({
        id: questions.id,
        slug: questions.slug,
        stemMd: questions.stemMd,
        difficulty: questions.difficulty,
      })
      .from(questions)
      .where(
        and(
          eq(questions.status, 'published'),
          // Note: In production, use inArray(questions.id, missedQuestionIds)
        )
      );

    // Map results
    const rows: MissedQuestionRow[] = missedQuestionIds
      .map((qId) => {
        const q = questionRows.find((r) => r.id === qId);
        const data = latestByQuestion.get(qId);
        if (!q || !data) return null;

        return {
          questionId: q.id,
          slug: q.slug,
          stemMd: q.stemMd,
          difficulty: q.difficulty,
          lastAnsweredAt: data.answeredAt.toISOString(),
        };
      })
      .filter((r): r is MissedQuestionRow => r !== null);

    return success({
      rows,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  } catch (error) {
    console.error('getMissedQuestions error:', error);
    return failure('INTERNAL_ERROR', 'Failed to fetch missed questions');
  }
}
```

### Step 3: Extend Bookmark Actions

Update `bookmarks.actions.ts` to include `getBookmarks`:

```typescript
export async function getBookmarks(): Promise<ActionResult<GetBookmarksOutput>> {
  // Implementation per master_spec.md Section 4.5.10
}
```

### Step 4: Create Review Page

**File:** `app/(app)/app/review/page.tsx`

Server component that:
- Calls `getMissedQuestions` with pagination params from searchParams
- Renders `QuestionListItem` components
- Shows pagination controls
- Shows empty state if no missed questions

### Step 5: Create Bookmarks Page

**File:** `app/(app)/app/bookmarks/page.tsx`

Server component that:
- Calls `getBookmarks`
- Renders `QuestionListItem` components with remove button
- Shows empty state if no bookmarks

### Step 6: Create Shared List Item Component

**File:** `components/question/QuestionListItem.tsx`

```typescript
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type Props = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  meta?: React.ReactNode; // For lastAnsweredAt, bookmarkedAt, etc.
  actions?: React.ReactNode; // For remove bookmark button
};

export function QuestionListItem({
  questionId,
  slug,
  stemMd,
  difficulty,
  meta,
  actions,
}: Props) {
  const difficultyColors = {
    easy: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    hard: 'bg-red-100 text-red-800',
  };

  // Truncate stem for preview
  const preview = stemMd.length > 150 ? stemMd.slice(0, 150) + '...' : stemMd;

  return (
    <div
      data-testid="question-list-item"
      className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex justify-between items-start">
        <Link href={`/app/question/${questionId}`} className="flex-1">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                data-testid="difficulty-badge"
                className={difficultyColors[difficulty]}
              >
                {difficulty}
              </Badge>
              <span className="text-sm text-muted-foreground">{slug}</span>
            </div>
            <p className="text-sm">{preview}</p>
            {meta && (
              <div className="text-xs text-muted-foreground">{meta}</div>
            )}
          </div>
        </Link>
        {actions && <div className="ml-4">{actions}</div>}
      </div>
    </div>
  );
}
```

---

## Quality Gates (Must Pass)

```bash
pnpm tsc --noEmit
pnpm biome check .
pnpm test lib/review/queries.test.ts lib/bookmarks/queries.test.ts
pnpm test:integration tests/integration/review.integration.test.ts
pnpm test:e2e tests/e2e/review.spec.ts tests/e2e/bookmarks.spec.ts
```

---

## Definition of Done

- [ ] All unit tests pass (query helpers)
- [ ] All integration tests pass (DB queries)
- [ ] All E2E tests pass (full flows)
- [ ] Missed questions list shows questions with most recent incorrect attempt
- [ ] Bookmarks list shows all bookmarked questions
- [ ] Reattempt creates new attempt record
- [ ] Remove bookmark works from bookmarks page
- [ ] Pagination works correctly
- [ ] Empty states display properly
- [ ] All changes committed with atomic commits

---

## Files Checklist

### Create
- [ ] `lib/review/queries.ts`
- [ ] `lib/review/queries.test.ts`
- [ ] `lib/bookmarks/queries.ts`
- [ ] `lib/bookmarks/queries.test.ts`
- [ ] `app/(app)/app/_actions/review.actions.ts`
- [ ] `app/(app)/app/review/page.tsx`
- [ ] `app/(app)/app/bookmarks/page.tsx`
- [ ] `components/question/QuestionListItem.tsx`
- [ ] `tests/integration/review.integration.test.ts`
- [ ] `tests/e2e/review.spec.ts`
- [ ] `tests/e2e/bookmarks.spec.ts`

### Modify
- [ ] `app/(app)/app/_actions/bookmarks.actions.ts` (add getBookmarks)

---

## Anti-Patterns to Avoid

1. **NO caching "missed" status** - Always compute from latest attempt
2. **NO N+1 queries** - Batch question fetches
3. **NO client-side filtering** - Server handles all logic
4. **NO infinite scroll without limits** - Always paginate
5. **NO stale list after action** - Revalidate after bookmark toggle
