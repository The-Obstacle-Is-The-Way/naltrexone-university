# SPEC-013: Practice Sessions Feature Slice

**Spec ID:** SPEC-013
**Status:** Ready
**Dependencies:** SLICE-2 (Core Question Loop) must be complete
**Estimated Complexity:** Medium (Session state management, question ordering, exam vs tutor modes)

---

## Overview

This slice implements structured practice sessions: users choose mode (tutor/exam), question count, and filters, then work through a fixed set of questions with progress tracking and a summary at the end.

**Core Principle:** Sessions are immutable once started. The question list is determined upfront and stored in `params_json`. No mid-session changes. This ensures deterministic behavior and fair exam simulations.

---

## User Stories

1. As a subscribed user, I can configure a practice session with mode, count, and tag filters.
2. As a subscribed user, I see my progress (3/20) during a session.
3. As a subscribed user in tutor mode, I see explanations immediately after each answer.
4. As a subscribed user in exam mode, I do NOT see explanations until the session ends.
5. As a subscribed user, I can end a session early and see my summary.
6. As a subscribed user, I see accuracy and duration when a session completes.

---

## Architecture Decisions (SOLID + Clean Architecture)

### Single Responsibility
- `practice.actions.ts` — Session lifecycle only (start, end)
- `questions.actions.ts` — Question fetching (extended with session support)
- Session runner page — UI orchestration only, no business logic

### Open/Closed
- Mode behavior (tutor vs exam) is a simple conditional, not a strategy pattern (YAGNI)
- New modes could be added via enum extension

### Liskov Substitution
- Both tutor and exam modes use the same components, just with different props

### Dependency Inversion
- Session state is read from DB, not reconstructed from client state
- Progress calculated server-side

### Interface Segregation
- `StartPracticeSessionOutput` returns only sessionId
- `EndPracticeSessionOutput` returns only summary data
- Question responses include session context when applicable

---

## Test-First Specification (TDD)

### Phase 1: Unit Tests (Write FIRST)

#### File: `lib/practice/shuffle.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { shuffleWithSeed, createSeedFromUserAndTime } from './shuffle';

describe('shuffleWithSeed', () => {
  it('produces deterministic output for same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const seed = 12345;

    const result1 = shuffleWithSeed([...items], seed);
    const result2 = shuffleWithSeed([...items], seed);

    expect(result1).toEqual(result2);
  });

  it('produces different output for different seeds', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const result1 = shuffleWithSeed([...items], 111);
    const result2 = shuffleWithSeed([...items], 222);

    expect(result1).not.toEqual(result2);
  });

  it('contains all original items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffleWithSeed([...items], 999);

    expect(result).toHaveLength(items.length);
    expect(new Set(result)).toEqual(new Set(items));
  });

  it('handles empty array', () => {
    expect(shuffleWithSeed([], 123)).toEqual([]);
  });

  it('handles single item', () => {
    expect(shuffleWithSeed(['only'], 123)).toEqual(['only']);
  });
});

describe('createSeedFromUserAndTime', () => {
  it('produces consistent output for same inputs', () => {
    const seed1 = createSeedFromUserAndTime('user-123', 1706745600000);
    const seed2 = createSeedFromUserAndTime('user-123', 1706745600000);

    expect(seed1).toBe(seed2);
  });

  it('produces different output for different users', () => {
    const timestamp = Date.now();
    const seed1 = createSeedFromUserAndTime('user-123', timestamp);
    const seed2 = createSeedFromUserAndTime('user-456', timestamp);

    expect(seed1).not.toBe(seed2);
  });

  it('returns a positive integer', () => {
    const seed = createSeedFromUserAndTime('test', Date.now());
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThan(0);
  });
});
```

#### File: `lib/practice/summary.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { computeSessionSummary } from './summary';

describe('computeSessionSummary', () => {
  it('computes accuracy correctly', () => {
    const attempts = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true },
    ];

    const summary = computeSessionSummary(
      attempts,
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-31T10:15:00Z')
    );

    expect(summary.answered).toBe(4);
    expect(summary.correct).toBe(3);
    expect(summary.accuracy).toBeCloseTo(0.75, 2);
  });

  it('handles zero attempts', () => {
    const summary = computeSessionSummary(
      [],
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-31T10:00:30Z')
    );

    expect(summary.answered).toBe(0);
    expect(summary.correct).toBe(0);
    expect(summary.accuracy).toBe(0);
  });

  it('calculates duration in seconds', () => {
    const summary = computeSessionSummary(
      [{ isCorrect: true }],
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-31T10:05:30Z') // 5 min 30 sec = 330 sec
    );

    expect(summary.durationSeconds).toBe(330);
  });

  it('floors duration to integer seconds', () => {
    const summary = computeSessionSummary(
      [{ isCorrect: true }],
      new Date('2026-01-31T10:00:00.000Z'),
      new Date('2026-01-31T10:00:05.999Z') // 5.999 seconds
    );

    expect(summary.durationSeconds).toBe(5);
  });
});
```

### Phase 2: Integration Tests (Write SECOND)

#### File: `tests/integration/practice.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  users,
  questions,
  choices,
  practiceSessions,
  attempts,
  stripeSubscriptions,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';

describe('Practice Sessions DB Integration', () => {
  let testUserId: string;
  let questionIds: string[] = [];

  beforeAll(async () => {
    // Create test user with subscription
    const [user] = await db.insert(users).values({
      clerkUserId: 'test_clerk_practice',
      email: 'practice@test.com',
    }).returning();
    testUserId = user.id;

    await db.insert(stripeSubscriptions).values({
      userId: testUserId,
      stripeSubscriptionId: 'sub_test_practice',
      status: 'active',
      priceId: 'price_test',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Create 5 test questions
    for (let i = 1; i <= 5; i++) {
      const [q] = await db.insert(questions).values({
        slug: `practice-test-q${i}`,
        stemMd: `Question ${i}`,
        explanationMd: `Explanation ${i}`,
        difficulty: 'medium',
        status: 'published',
      }).returning();
      questionIds.push(q.id);

      await db.insert(choices).values([
        { questionId: q.id, label: 'A', textMd: 'Wrong', isCorrect: false, sortOrder: 1 },
        { questionId: q.id, label: 'B', textMd: 'Correct', isCorrect: true, sortOrder: 2 },
      ]);
    }
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(practiceSessions).where(eq(practiceSessions.userId, testUserId));
    for (const qId of questionIds) {
      await db.delete(choices).where(eq(choices.questionId, qId));
      await db.delete(questions).where(eq(questions.id, qId));
    }
    await db.delete(stripeSubscriptions).where(eq(stripeSubscriptions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  beforeEach(async () => {
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(practiceSessions).where(eq(practiceSessions.userId, testUserId));
  });

  describe('practice_sessions table', () => {
    it('creates session with params_json', async () => {
      const params = {
        count: 3,
        tagSlugs: [],
        difficulties: ['medium'] as const,
        questionIds: questionIds.slice(0, 3),
      };

      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'tutor',
        paramsJson: params,
      }).returning();

      expect(session.paramsJson).toEqual(params);
      expect(session.mode).toBe('tutor');
      expect(session.endedAt).toBeNull();
    });

    it('stores question order in params_json', async () => {
      const orderedIds = [questionIds[2], questionIds[0], questionIds[4]];

      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'exam',
        paramsJson: {
          count: 3,
          tagSlugs: [],
          difficulties: [],
          questionIds: orderedIds,
        },
      }).returning();

      expect(session.paramsJson.questionIds).toEqual(orderedIds);
    });

    it('updates endedAt when session ends', async () => {
      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'tutor',
        paramsJson: {
          count: 2,
          tagSlugs: [],
          difficulties: [],
          questionIds: questionIds.slice(0, 2),
        },
      }).returning();

      expect(session.endedAt).toBeNull();

      const endedAt = new Date();
      await db.update(practiceSessions)
        .set({ endedAt })
        .where(eq(practiceSessions.id, session.id));

      const [updated] = await db.select()
        .from(practiceSessions)
        .where(eq(practiceSessions.id, session.id));

      expect(updated.endedAt).not.toBeNull();
    });
  });

  describe('attempts linked to sessions', () => {
    it('links attempt to practice session', async () => {
      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'tutor',
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [questionIds[0]],
        },
      }).returning();

      // Get correct choice
      const [correctChoice] = await db.select()
        .from(choices)
        .where(and(
          eq(choices.questionId, questionIds[0]),
          eq(choices.isCorrect, true)
        ));

      await db.insert(attempts).values({
        userId: testUserId,
        questionId: questionIds[0],
        practiceSessionId: session.id,
        selectedChoiceId: correctChoice.id,
        isCorrect: true,
      });

      const sessionAttempts = await db.select()
        .from(attempts)
        .where(eq(attempts.practiceSessionId, session.id));

      expect(sessionAttempts).toHaveLength(1);
      expect(sessionAttempts[0].questionId).toBe(questionIds[0]);
    });

    it('can query attempts by session to compute progress', async () => {
      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'exam',
        paramsJson: {
          count: 3,
          tagSlugs: [],
          difficulties: [],
          questionIds: questionIds.slice(0, 3),
        },
      }).returning();

      // Answer first 2 questions
      for (let i = 0; i < 2; i++) {
        const [choice] = await db.select()
          .from(choices)
          .where(eq(choices.questionId, questionIds[i]))
          .limit(1);

        await db.insert(attempts).values({
          userId: testUserId,
          questionId: questionIds[i],
          practiceSessionId: session.id,
          selectedChoiceId: choice.id,
          isCorrect: choice.isCorrect,
        });
      }

      const answered = await db.select()
        .from(attempts)
        .where(eq(attempts.practiceSessionId, session.id));

      expect(answered).toHaveLength(2);

      // Progress: 2/3
      const total = session.paramsJson.count;
      expect(answered.length).toBe(2);
      expect(total).toBe(3);
    });
  });

  describe('session query patterns', () => {
    it('finds session by id and user_id', async () => {
      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'tutor',
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [questionIds[0]],
        },
      }).returning();

      const [found] = await db.select()
        .from(practiceSessions)
        .where(and(
          eq(practiceSessions.id, session.id),
          eq(practiceSessions.userId, testUserId)
        ));

      expect(found).toBeDefined();
      expect(found.id).toBe(session.id);
    });

    it('does not return session for wrong user', async () => {
      const [session] = await db.insert(practiceSessions).values({
        userId: testUserId,
        mode: 'tutor',
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [questionIds[0]],
        },
      }).returning();

      const found = await db.select()
        .from(practiceSessions)
        .where(and(
          eq(practiceSessions.id, session.id),
          eq(practiceSessions.userId, 'wrong-user-id')
        ));

      expect(found).toHaveLength(0);
    });
  });
});
```

### Phase 3: E2E Tests (Write THIRD)

#### File: `tests/e2e/session.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Practice Session Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Auth setup handled by global setup
  });

  test('can start a tutor mode session', async ({ page }) => {
    await page.goto('/app/practice');

    // Select tutor mode
    await page.getByLabel(/tutor/i).check();

    // Set count
    await page.getByLabel(/questions/i).fill('5');

    // Start session
    await page.getByRole('button', { name: /start/i }).click();

    // Should navigate to session page
    await expect(page).toHaveURL(/\/app\/practice\/[a-f0-9-]+/);
  });

  test('shows progress indicator during session', async ({ page }) => {
    await page.goto('/app/practice');
    await page.getByLabel(/tutor/i).check();
    await page.getByLabel(/questions/i).fill('3');
    await page.getByRole('button', { name: /start/i }).click();

    // Should show 1/3
    await expect(page.getByText(/1.*\/.*3/)).toBeVisible();
  });

  test('tutor mode shows explanation after each answer', async ({ page }) => {
    await page.goto('/app/practice');
    await page.getByLabel(/tutor/i).check();
    await page.getByLabel(/questions/i).fill('2');
    await page.getByRole('button', { name: /start/i }).click();

    // Answer question
    await page.locator('[data-testid="choice-option"]').first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // Explanation should be visible
    await expect(page.locator('[data-testid="explanation"]')).toBeVisible();
  });

  test('exam mode hides explanation until session ends', async ({ page }) => {
    await page.goto('/app/practice');
    await page.getByLabel(/exam/i).check();
    await page.getByLabel(/questions/i).fill('2');
    await page.getByRole('button', { name: /start/i }).click();

    // Answer question
    await page.locator('[data-testid="choice-option"]').first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // Explanation should NOT be visible in exam mode
    await expect(page.locator('[data-testid="explanation"]')).not.toBeVisible();
  });

  test('can end session early and see summary', async ({ page }) => {
    await page.goto('/app/practice');
    await page.getByLabel(/tutor/i).check();
    await page.getByLabel(/questions/i).fill('5');
    await page.getByRole('button', { name: /start/i }).click();

    // Answer 2 questions
    for (let i = 0; i < 2; i++) {
      await page.locator('[data-testid="choice-option"]').first().click();
      await page.getByRole('button', { name: /submit/i }).click();
      await page.getByRole('button', { name: /next/i }).click();
    }

    // End session early
    await page.getByRole('button', { name: /end.*session/i }).click();

    // Should see summary
    await expect(page.getByText(/answered.*2/i)).toBeVisible();
    await expect(page.getByText(/accuracy/i)).toBeVisible();
  });

  test('session completes naturally when all questions answered', async ({ page }) => {
    await page.goto('/app/practice');
    await page.getByLabel(/tutor/i).check();
    await page.getByLabel(/questions/i).fill('2');
    await page.getByRole('button', { name: /start/i }).click();

    // Answer all questions
    for (let i = 0; i < 2; i++) {
      await page.locator('[data-testid="choice-option"]').first().click();
      await page.getByRole('button', { name: /submit/i }).click();

      if (i < 1) {
        await page.getByRole('button', { name: /next/i }).click();
      }
    }

    // After last question, should see summary or prompt to finish
    await page.getByRole('button', { name: /finish|complete/i }).click();

    // Should show summary
    await expect(page.getByText(/session.*complete/i)).toBeVisible();
    await expect(page.getByText(/accuracy/i)).toBeVisible();
    await expect(page.getByText(/duration/i)).toBeVisible();
  });
});
```

---

## Implementation Checklist

### Step 1: Create Shuffle Utilities

**File:** `lib/practice/shuffle.ts`

```typescript
import { createHash } from 'crypto';

/**
 * Fisher-Yates shuffle with seeded pseudo-random number generator
 */
export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let currentIndex = result.length;

  // Simple seeded PRNG (mulberry32)
  let state = seed;
  const random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  while (currentIndex > 0) {
    const randomIndex = Math.floor(random() * currentIndex);
    currentIndex--;
    [result[currentIndex], result[randomIndex]] = [
      result[randomIndex],
      result[currentIndex],
    ];
  }

  return result;
}

/**
 * Create deterministic seed from user ID and timestamp
 */
export function createSeedFromUserAndTime(userId: string, timestamp: number): number {
  const input = `${userId}:${timestamp}`;
  const hash = createHash('sha256').update(input).digest();
  // Take first 4 bytes as unsigned 32-bit integer
  return hash.readUInt32BE(0);
}
```

### Step 2: Create Summary Utilities

**File:** `lib/practice/summary.ts`

```typescript
export type SessionSummary = {
  answered: number;
  correct: number;
  accuracy: number;
  durationSeconds: number;
};

export function computeSessionSummary(
  attempts: { isCorrect: boolean }[],
  startedAt: Date,
  endedAt: Date
): SessionSummary {
  const answered = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const accuracy = answered > 0 ? correct / answered : 0;
  const durationSeconds = Math.floor(
    (endedAt.getTime() - startedAt.getTime()) / 1000
  );

  return { answered, correct, accuracy, durationSeconds };
}
```

### Step 3: Implement Practice Actions

**File:** `src/adapters/controllers/practice-controller.ts`

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  users,
  questions,
  tags,
  questionTags,
  practiceSessions,
  attempts,
} from '@/db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { checkUserEntitlement } from '@/lib/subscription';
import { shuffleWithSeed, createSeedFromUserAndTime } from '@/lib/practice/shuffle';
import { computeSessionSummary } from '@/lib/practice/summary';
import { type ActionResult, success, failure } from './action-result';

// Input schemas
const StartPracticeSessionInput = z.object({
  mode: z.enum(['tutor', 'exam']),
  count: z.number().int().min(1).max(200),
  tagSlugs: z.array(z.string().min(1)).max(50).default([]),
  difficulties: z.array(z.enum(['easy', 'medium', 'hard'])).max(3).default([]),
}).strict();

const EndPracticeSessionInput = z.object({
  sessionId: z.string().uuid(),
}).strict();

// Output types
export type StartPracticeSessionOutput = { sessionId: string };

export type EndPracticeSessionOutput = {
  sessionId: string;
  endedAt: string;
  totals: {
    answered: number;
    correct: number;
    accuracy: number;
    durationSeconds: number;
  };
};

// Actions
export async function startPracticeSession(
  input: z.infer<typeof StartPracticeSessionInput>
): Promise<ActionResult<StartPracticeSessionOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = StartPracticeSessionInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid input');
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

    // Build candidate question query
    let candidateQuery = db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.status, 'published'));

    // Apply tag filter if specified
    if (parsed.data.tagSlugs.length > 0) {
      const tagRows = await db
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.slug, parsed.data.tagSlugs));

      if (tagRows.length > 0) {
        const tagIds = tagRows.map((t) => t.id);
        const questionIdsWithTags = await db
          .selectDistinct({ questionId: questionTags.questionId })
          .from(questionTags)
          .where(inArray(questionTags.tagId, tagIds));

        const qIds = questionIdsWithTags.map((q) => q.questionId);
        if (qIds.length > 0) {
          candidateQuery = candidateQuery.where(inArray(questions.id, qIds));
        }
      }
    }

    // Apply difficulty filter if specified
    if (parsed.data.difficulties.length > 0) {
      candidateQuery = candidateQuery.where(
        inArray(questions.difficulty, parsed.data.difficulties)
      );
    }

    const candidates = await candidateQuery;

    if (candidates.length === 0) {
      return failure('NOT_FOUND', 'No questions match the selected filters');
    }

    // Shuffle and take count
    const seed = createSeedFromUserAndTime(user.id, Date.now());
    const shuffledIds = shuffleWithSeed(
      candidates.map((c) => c.id),
      seed
    );
    const selectedIds = shuffledIds.slice(0, parsed.data.count);

    // Create session
    const [session] = await db.insert(practiceSessions).values({
      userId: user.id,
      mode: parsed.data.mode,
      paramsJson: {
        count: selectedIds.length,
        tagSlugs: parsed.data.tagSlugs,
        difficulties: parsed.data.difficulties,
        questionIds: selectedIds,
      },
    }).returning();

    return success({ sessionId: session.id });
  } catch (error) {
    console.error('startPracticeSession error:', error);
    return failure('INTERNAL_ERROR', 'Failed to start session');
  }
}

export async function endPracticeSession(
  input: z.infer<typeof EndPracticeSessionInput>
): Promise<ActionResult<EndPracticeSessionOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = EndPracticeSessionInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid input');
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

    // Find session owned by user
    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.id, parsed.data.sessionId),
          eq(practiceSessions.userId, user.id)
        )
      );

    if (!session) {
      return failure('NOT_FOUND', 'Session not found');
    }

    if (session.endedAt) {
      return failure('CONFLICT', 'Session already ended');
    }

    // End session
    const endedAt = new Date();
    await db
      .update(practiceSessions)
      .set({ endedAt })
      .where(eq(practiceSessions.id, session.id));

    // Compute summary
    const sessionAttempts = await db
      .select({ isCorrect: attempts.isCorrect })
      .from(attempts)
      .where(eq(attempts.practiceSessionId, session.id));

    const summary = computeSessionSummary(
      sessionAttempts,
      session.startedAt,
      endedAt
    );

    return success({
      sessionId: session.id,
      endedAt: endedAt.toISOString(),
      totals: summary,
    });
  } catch (error) {
    console.error('endPracticeSession error:', error);
    return failure('INTERNAL_ERROR', 'Failed to end session');
  }
}

// Get session details for progress tracking
export async function getSessionProgress(
  sessionId: string
): Promise<ActionResult<{
  mode: 'tutor' | 'exam';
  total: number;
  answered: number;
  currentIndex: number;
  isEnded: boolean;
}>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return failure('UNAUTHENTICATED', 'User not found');
    }

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.id, sessionId),
          eq(practiceSessions.userId, user.id)
        )
      );

    if (!session) {
      return failure('NOT_FOUND', 'Session not found');
    }

    const answered = await db
      .select()
      .from(attempts)
      .where(eq(attempts.practiceSessionId, sessionId));

    return success({
      mode: session.mode,
      total: session.paramsJson.count,
      answered: answered.length,
      currentIndex: answered.length,
      isEnded: !!session.endedAt,
    });
  } catch (error) {
    console.error('getSessionProgress error:', error);
    return failure('INTERNAL_ERROR', 'Failed to get session progress');
  }
}
```

### Step 4: Extend Question Actions for Session Support

Update `questions.actions.ts` to support `sessionId` parameter (see master_spec.md Section 4.5.3 for full implementation).

### Step 5: Create Session Runner Page

**File:** `app/(app)/app/practice/[sessionId]/page.tsx`

Create the session runner UI that:
- Fetches session progress on load
- Shows current question with progress indicator
- Handles tutor vs exam mode for explanation visibility
- Allows ending session early
- Shows summary when complete

### Step 6: Create Practice Setup Page

**File:** `app/(app)/app/practice/page.tsx`

Create the session setup UI with:
- Mode selection (tutor/exam radio buttons)
- Question count input
- Optional tag filters
- Start button that calls `startPracticeSession` and redirects

---

## Quality Gates (Must Pass)

```bash
pnpm tsc --noEmit
pnpm biome check .
pnpm test lib/practice/shuffle.test.ts lib/practice/summary.test.ts
pnpm test:integration tests/integration/practice.integration.test.ts
pnpm test:e2e tests/e2e/session.spec.ts
```

---

## Definition of Done

- [ ] All unit tests pass (shuffle, summary)
- [ ] All integration tests pass (DB operations)
- [ ] All E2E tests pass (full flow)
- [ ] Sessions create with deterministic question order
- [ ] Progress displays correctly (X/Y)
- [ ] Tutor mode shows explanations immediately
- [ ] Exam mode hides explanations until session ends
- [ ] Sessions can end early with summary
- [ ] Sessions complete naturally with summary
- [ ] All changes committed with atomic commits

---

## Files Checklist

### Create
- [ ] `lib/practice/shuffle.ts`
- [ ] `lib/practice/shuffle.test.ts`
- [ ] `lib/practice/summary.ts`
- [ ] `lib/practice/summary.test.ts`
- [ ] `src/adapters/controllers/practice-controller.ts`
- [ ] `app/(app)/app/practice/page.tsx`
- [ ] `app/(app)/app/practice/[sessionId]/page.tsx`
- [ ] `tests/integration/practice.integration.test.ts`
- [ ] `tests/e2e/session.spec.ts`

### Modify
- [ ] `app/(app)/app/_actions/questions.actions.ts` (add session support)

---

## Anti-Patterns to Avoid

1. **NO mutable session state** - Question list is fixed at start
2. **NO client-side progress tracking** - Always fetch from server
3. **NO exam mode explanation leaks** - Server enforces visibility
4. **NO session hijacking** - Always verify user owns session
5. **NO floating point accuracy issues** - Use integer arithmetic for stats
