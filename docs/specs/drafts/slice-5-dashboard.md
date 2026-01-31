# slice-5-dashboard

**Slice ID:** SLICE-5
**Status:** Not Started
**Dependencies:** SLICE-4 (Review and Bookmarks) must be complete
**Estimated Complexity:** Low-Medium (Stats computation, streak logic, UI components)

---

## Overview

This slice implements the user dashboard: stats cards showing progress, accuracy, streak, and recent activity. This is the "home base" for subscribed users—a motivational snapshot of their learning journey.

**Core Principle:** Stats are computed from raw data, not stored. This ensures accuracy and eliminates sync issues. The dashboard should load fast, so queries are optimized.

---

## User Stories

1. As a subscribed user, I see my total questions answered on the dashboard.
2. As a subscribed user, I see my overall accuracy percentage.
3. As a subscribed user, I see my accuracy over the last 7 days.
4. As a subscribed user, I see my current streak (consecutive days with at least 1 attempt).
5. As a subscribed user, I see my 20 most recent attempts with correctness indicators.

---

## Architecture Decisions (SOLID + Clean Architecture)

### Single Responsibility
- `stats.actions.ts` — Fetches and computes stats only
- `lib/stats/computeStats.ts` — Pure computation functions (testable without DB)
- `StatCard.tsx` — Displays a single stat metric
- `RecentActivityList.tsx` — Displays recent attempts list

### Open/Closed
- Stat cards use a generic `StatCard` component with customizable formatting
- New stats can be added without modifying existing components

### Dependency Inversion
- `computeStats.ts` functions receive data as parameters, not fetched internally
- Dashboard page composes stats from action output

### Interface Segregation
- `UserStatsOutput` contains only what the dashboard needs
- No extra data transferred

---

## Test-First Specification (TDD)

### Phase 1: Unit Tests (Write FIRST)

#### File: `lib/stats/computeStats.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeAccuracy,
  computeStreak,
  computeAnsweredInWindow,
  computeAccuracyInWindow,
} from './computeStats';

describe('computeAccuracy', () => {
  it('returns 0 for no attempts', () => {
    expect(computeAccuracy(0, 0)).toBe(0);
  });

  it('returns 1 for all correct', () => {
    expect(computeAccuracy(10, 10)).toBe(1);
  });

  it('returns 0 for all incorrect', () => {
    expect(computeAccuracy(10, 0)).toBe(0);
  });

  it('calculates correct ratio', () => {
    expect(computeAccuracy(4, 3)).toBeCloseTo(0.75, 2);
    expect(computeAccuracy(10, 7)).toBeCloseTo(0.7, 2);
    expect(computeAccuracy(3, 1)).toBeCloseTo(0.333, 2);
  });
});

describe('computeStreak', () => {
  const today = new Date('2026-01-31T12:00:00Z');

  it('returns 0 for no attempts', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('returns 1 for attempt only today', () => {
    const dates = [new Date('2026-01-31T10:00:00Z')];
    expect(computeStreak(dates, today)).toBe(1);
  });

  it('returns consecutive days from today', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'), // Today
      new Date('2026-01-30T10:00:00Z'), // Yesterday
      new Date('2026-01-29T10:00:00Z'), // 2 days ago
    ];
    expect(computeStreak(dates, today)).toBe(3);
  });

  it('breaks streak on missing day', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'), // Today
      new Date('2026-01-30T10:00:00Z'), // Yesterday
      // Missing 2026-01-29
      new Date('2026-01-28T10:00:00Z'), // 3 days ago
    ];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it('returns 0 if no attempt today', () => {
    const dates = [
      new Date('2026-01-30T10:00:00Z'), // Yesterday
      new Date('2026-01-29T10:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(0);
  });

  it('handles multiple attempts on same day', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-31T14:00:00Z'),
      new Date('2026-01-31T18:00:00Z'),
      new Date('2026-01-30T10:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it('works across month boundaries', () => {
    const endOfFeb = new Date('2026-03-01T12:00:00Z');
    const dates = [
      new Date('2026-03-01T10:00:00Z'),
      new Date('2026-02-28T10:00:00Z'),
    ];
    expect(computeStreak(dates, endOfFeb)).toBe(2);
  });

  it('uses UTC for day comparison', () => {
    // Test that 11 PM UTC on Jan 30 and 1 AM UTC on Jan 31 are different days
    const dates = [
      new Date('2026-01-31T01:00:00Z'),
      new Date('2026-01-30T23:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(2);
  });
});

describe('computeAnsweredInWindow', () => {
  const now = new Date('2026-01-31T12:00:00Z');

  it('returns 0 for no attempts in window', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-20T10:00:00Z') }, // Too old
    ];
    expect(computeAnsweredInWindow(attempts, 7, now)).toBe(0);
  });

  it('counts attempts within window', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T10:00:00Z') }, // Today
      { answeredAt: new Date('2026-01-30T10:00:00Z') }, // 1 day ago
      { answeredAt: new Date('2026-01-25T10:00:00Z') }, // 6 days ago
      { answeredAt: new Date('2026-01-24T10:00:00Z') }, // 7 days ago (boundary)
    ];
    expect(computeAnsweredInWindow(attempts, 7, now)).toBe(4);
  });

  it('excludes attempts outside window', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T10:00:00Z') },
      { answeredAt: new Date('2026-01-23T10:00:00Z') }, // 8 days ago
    ];
    expect(computeAnsweredInWindow(attempts, 7, now)).toBe(1);
  });
});

describe('computeAccuracyInWindow', () => {
  const now = new Date('2026-01-31T12:00:00Z');

  it('returns 0 for no attempts in window', () => {
    expect(computeAccuracyInWindow([], 7, now)).toBe(0);
  });

  it('calculates accuracy only for attempts in window', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T10:00:00Z'), isCorrect: true },
      { answeredAt: new Date('2026-01-30T10:00:00Z'), isCorrect: true },
      { answeredAt: new Date('2026-01-29T10:00:00Z'), isCorrect: false },
      { answeredAt: new Date('2026-01-20T10:00:00Z'), isCorrect: false }, // Outside window
    ];
    // 3 in window, 2 correct = 0.666...
    expect(computeAccuracyInWindow(attempts, 7, now)).toBeCloseTo(0.667, 2);
  });
});
```

### Phase 2: Integration Tests (Write SECOND)

#### File: `tests/integration/stats.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  users,
  questions,
  choices,
  attempts,
  stripeSubscriptions,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

describe('Stats DB Integration', () => {
  let testUserId: string;
  let questionId: string;
  let correctChoiceId: string;
  let incorrectChoiceId: string;

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      clerkUserId: 'test_clerk_stats',
      email: 'stats@test.com',
    }).returning();
    testUserId = user.id;

    await db.insert(stripeSubscriptions).values({
      userId: testUserId,
      stripeSubscriptionId: 'sub_test_stats',
      status: 'active',
      priceId: 'price_test',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const [q] = await db.insert(questions).values({
      slug: 'stats-test-q1',
      stemMd: 'Stats Question',
      explanationMd: 'Explanation',
      difficulty: 'medium',
      status: 'published',
    }).returning();
    questionId = q.id;

    const [incorrect] = await db.insert(choices).values({
      questionId,
      label: 'A',
      textMd: 'Wrong',
      isCorrect: false,
      sortOrder: 1,
    }).returning();
    incorrectChoiceId = incorrect.id;

    const [correct] = await db.insert(choices).values({
      questionId,
      label: 'B',
      textMd: 'Correct',
      isCorrect: true,
      sortOrder: 2,
    }).returning();
    correctChoiceId = correct.id;
  });

  afterAll(async () => {
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(choices).where(eq(choices.questionId, questionId));
    await db.delete(questions).where(eq(questions.id, questionId));
    await db.delete(stripeSubscriptions).where(eq(stripeSubscriptions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  beforeEach(async () => {
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
  });

  describe('stats query patterns', () => {
    it('counts total attempts for user', async () => {
      await db.insert(attempts).values([
        { userId: testUserId, questionId, selectedChoiceId: correctChoiceId, isCorrect: true },
        { userId: testUserId, questionId, selectedChoiceId: incorrectChoiceId, isCorrect: false },
        { userId: testUserId, questionId, selectedChoiceId: correctChoiceId, isCorrect: true },
      ]);

      const result = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId));

      expect(result).toHaveLength(3);
    });

    it('counts correct attempts for user', async () => {
      await db.insert(attempts).values([
        { userId: testUserId, questionId, selectedChoiceId: correctChoiceId, isCorrect: true },
        { userId: testUserId, questionId, selectedChoiceId: incorrectChoiceId, isCorrect: false },
        { userId: testUserId, questionId, selectedChoiceId: correctChoiceId, isCorrect: true },
      ]);

      const result = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId));

      const correctCount = result.filter(a => a.isCorrect).length;
      expect(correctCount).toBe(2);
    });

    it('retrieves attempts with timestamps for streak calculation', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      await db.insert(attempts).values([
        { userId: testUserId, questionId, selectedChoiceId: correctChoiceId, isCorrect: true, answeredAt: now },
        { userId: testUserId, questionId, selectedChoiceId: correctChoiceId, isCorrect: true, answeredAt: yesterday },
      ]);

      const result = await db
        .select({ answeredAt: attempts.answeredAt })
        .from(attempts)
        .where(eq(attempts.userId, testUserId))
        .orderBy(desc(attempts.answeredAt));

      expect(result).toHaveLength(2);
      expect(result[0].answeredAt.getTime()).toBeGreaterThan(result[1].answeredAt.getTime());
    });

    it('retrieves recent activity with question slug', async () => {
      await db.insert(attempts).values({
        userId: testUserId,
        questionId,
        selectedChoiceId: correctChoiceId,
        isCorrect: true,
      });

      const result = await db
        .select({
          attemptId: attempts.id,
          questionId: attempts.questionId,
          isCorrect: attempts.isCorrect,
          answeredAt: attempts.answeredAt,
          slug: questions.slug,
        })
        .from(attempts)
        .innerJoin(questions, eq(attempts.questionId, questions.id))
        .where(eq(attempts.userId, testUserId))
        .orderBy(desc(attempts.answeredAt))
        .limit(20);

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('stats-test-q1');
    });
  });
});
```

### Phase 3: E2E Tests (Write THIRD)

#### File: `tests/e2e/dashboard.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Auth setup handled by global setup
  });

  test('displays stats cards', async ({ page }) => {
    await page.goto('/app/dashboard');

    // Should see stat cards
    await expect(page.getByText(/total answered/i)).toBeVisible();
    await expect(page.getByText(/accuracy/i)).toBeVisible();
    await expect(page.getByText(/streak/i)).toBeVisible();
  });

  test('shows total answered count', async ({ page }) => {
    await page.goto('/app/dashboard');

    // Find the stat card for total answered
    const totalCard = page.locator('[data-testid="stat-total-answered"]');
    await expect(totalCard).toBeVisible();

    // Should contain a number
    const value = await totalCard.locator('[data-testid="stat-value"]').textContent();
    expect(value).toMatch(/^\d+$/);
  });

  test('shows accuracy percentage', async ({ page }) => {
    await page.goto('/app/dashboard');

    const accuracyCard = page.locator('[data-testid="stat-accuracy"]');
    await expect(accuracyCard).toBeVisible();

    // Should contain percentage
    const value = await accuracyCard.locator('[data-testid="stat-value"]').textContent();
    expect(value).toMatch(/^\d+%$/);
  });

  test('shows current streak', async ({ page }) => {
    await page.goto('/app/dashboard');

    const streakCard = page.locator('[data-testid="stat-streak"]');
    await expect(streakCard).toBeVisible();

    const value = await streakCard.locator('[data-testid="stat-value"]').textContent();
    expect(value).toMatch(/^\d+ days?$/i);
  });

  test('shows last 7 days stats', async ({ page }) => {
    await page.goto('/app/dashboard');

    await expect(page.getByText(/last 7 days/i)).toBeVisible();
  });

  test('displays recent activity list', async ({ page }) => {
    await page.goto('/app/dashboard');

    // Should see recent activity section
    await expect(page.getByText(/recent activity/i)).toBeVisible();

    // Activity list should exist (may be empty for new users)
    await expect(page.locator('[data-testid="recent-activity"]')).toBeVisible();
  });

  test('recent activity shows question links', async ({ page }) => {
    await page.goto('/app/dashboard');

    const activityItems = page.locator('[data-testid="activity-item"]');
    const count = await activityItems.count();

    if (count > 0) {
      // First item should be clickable
      await activityItems.first().click();
      // Should navigate to question
      await expect(page.locator('[data-testid="question-stem"]')).toBeVisible();
    }
  });

  test('shows correct/incorrect indicators on activity', async ({ page }) => {
    await page.goto('/app/dashboard');

    const activityItems = page.locator('[data-testid="activity-item"]');
    const count = await activityItems.count();

    if (count > 0) {
      // Each item should have a correctness indicator
      const indicator = activityItems.first().locator('[data-testid="correctness-indicator"]');
      await expect(indicator).toBeVisible();
    }
  });
});
```

---

## Implementation Checklist

### Step 1: Create Pure Computation Functions

**File:** `lib/stats/computeStats.ts`

```typescript
/**
 * Compute accuracy ratio
 */
export function computeAccuracy(total: number, correct: number): number {
  if (total === 0) return 0;
  return correct / total;
}

/**
 * Compute current streak (consecutive UTC days with attempts, ending today)
 */
export function computeStreak(attemptDates: Date[], now: Date = new Date()): number {
  if (attemptDates.length === 0) return 0;

  // Convert to UTC date strings (YYYY-MM-DD)
  const toUTCDateString = (d: Date) => d.toISOString().split('T')[0];

  // Get unique dates
  const uniqueDates = new Set(attemptDates.map(toUTCDateString));

  // Check if today has an attempt
  const todayStr = toUTCDateString(now);
  if (!uniqueDates.has(todayStr)) {
    return 0;
  }

  // Count backwards from today
  let streak = 0;
  let checkDate = new Date(now);

  while (true) {
    const dateStr = toUTCDateString(checkDate);
    if (!uniqueDates.has(dateStr)) {
      break;
    }
    streak++;
    // Go to previous day
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

/**
 * Count attempts within N days window
 */
export function computeAnsweredInWindow(
  attempts: { answeredAt: Date }[],
  days: number,
  now: Date = new Date()
): number {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return attempts.filter((a) => a.answeredAt >= cutoff).length;
}

/**
 * Compute accuracy within N days window
 */
export function computeAccuracyInWindow(
  attempts: { answeredAt: Date; isCorrect: boolean }[],
  days: number,
  now: Date = new Date()
): number {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const inWindow = attempts.filter((a) => a.answeredAt >= cutoff);

  if (inWindow.length === 0) return 0;

  const correct = inWindow.filter((a) => a.isCorrect).length;
  return correct / inWindow.length;
}
```

### Step 2: Implement Stats Action

**File:** `app/(app)/app/_actions/stats.actions.ts`

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, questions, attempts } from '@/db/schema';
import { eq, desc, gte, and } from 'drizzle-orm';
import { checkUserEntitlement } from '@/lib/subscription';
import {
  computeAccuracy,
  computeStreak,
  computeAnsweredInWindow,
  computeAccuracyInWindow,
} from '@/lib/stats/computeStats';
import { type ActionResult, success, failure } from './actionResult';

export type RecentActivity = {
  answeredAt: string;
  questionId: string;
  slug: string;
  isCorrect: boolean;
};

export type UserStatsOutput = {
  totalAnswered: number;
  accuracyOverall: number;
  answeredLast7Days: number;
  accuracyLast7Days: number;
  currentStreakDays: number;
  recentActivity: RecentActivity[];
};

export async function getUserStats(): Promise<ActionResult<UserStatsOutput>> {
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

    const isEntitled = await checkUserEntitlement(user.id);
    if (!isEntitled) {
      return failure('UNSUBSCRIBED', 'Active subscription required');
    }

    // Get all attempts for user (last 60 days for streak calculation)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const userAttempts = await db
      .select({
        isCorrect: attempts.isCorrect,
        answeredAt: attempts.answeredAt,
        questionId: attempts.questionId,
      })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, user.id),
          gte(attempts.answeredAt, sixtyDaysAgo)
        )
      )
      .orderBy(desc(attempts.answeredAt));

    // Get total counts (all time - could optimize with separate query)
    const allAttempts = await db
      .select({
        isCorrect: attempts.isCorrect,
      })
      .from(attempts)
      .where(eq(attempts.userId, user.id));

    const totalAnswered = allAttempts.length;
    const totalCorrect = allAttempts.filter((a) => a.isCorrect).length;

    // Compute stats
    const now = new Date();
    const accuracyOverall = computeAccuracy(totalAnswered, totalCorrect);
    const answeredLast7Days = computeAnsweredInWindow(userAttempts, 7, now);
    const accuracyLast7Days = computeAccuracyInWindow(userAttempts, 7, now);
    const currentStreakDays = computeStreak(
      userAttempts.map((a) => a.answeredAt),
      now
    );

    // Get recent activity with question slugs (limit 20)
    const recentWithSlugs = await db
      .select({
        answeredAt: attempts.answeredAt,
        questionId: attempts.questionId,
        isCorrect: attempts.isCorrect,
        slug: questions.slug,
      })
      .from(attempts)
      .innerJoin(questions, eq(attempts.questionId, questions.id))
      .where(eq(attempts.userId, user.id))
      .orderBy(desc(attempts.answeredAt))
      .limit(20);

    const recentActivity: RecentActivity[] = recentWithSlugs.map((a) => ({
      answeredAt: a.answeredAt.toISOString(),
      questionId: a.questionId,
      slug: a.slug,
      isCorrect: a.isCorrect,
    }));

    return success({
      totalAnswered,
      accuracyOverall,
      answeredLast7Days,
      accuracyLast7Days,
      currentStreakDays,
      recentActivity,
    });
  } catch (error) {
    console.error('getUserStats error:', error);
    return failure('INTERNAL_ERROR', 'Failed to fetch stats');
  }
}
```

### Step 3: Create Stat Card Component

**File:** `components/stats/StatCard.tsx`

```typescript
type Props = {
  testId: string;
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
};

export function StatCard({ testId, label, value, sublabel, icon }: Props) {
  return (
    <div
      data-testid={testId}
      className="p-6 bg-white rounded-lg border shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            data-testid="stat-value"
            className="text-3xl font-bold mt-1"
          >
            {value}
          </p>
          {sublabel && (
            <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
          )}
        </div>
        {icon && (
          <div className="text-muted-foreground">{icon}</div>
        )}
      </div>
    </div>
  );
}
```

### Step 4: Create Recent Activity Component

**File:** `components/stats/RecentActivityList.tsx`

```typescript
import Link from 'next/link';
import { CheckCircle, XCircle } from 'lucide-react';
import type { RecentActivity } from '@/app/(app)/app/_actions/stats.actions';

type Props = {
  activities: RecentActivity[];
};

export function RecentActivityList({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <div data-testid="recent-activity" className="text-center py-8 text-muted-foreground">
        No recent activity. Start practicing!
      </div>
    );
  }

  return (
    <div data-testid="recent-activity" className="space-y-2">
      {activities.map((activity, index) => (
        <Link
          key={`${activity.questionId}-${activity.answeredAt}`}
          href={`/app/question/${activity.questionId}`}
          data-testid="activity-item"
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div
            data-testid="correctness-indicator"
            className={activity.isCorrect ? 'text-green-500' : 'text-red-500'}
          >
            {activity.isCorrect ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{activity.slug}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(activity.answeredAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

### Step 5: Create Dashboard Page

**File:** `app/(app)/app/dashboard/page.tsx`

```typescript
import { getUserStats } from '../_actions/stats.actions';
import { StatCard } from '@/components/stats/StatCard';
import { RecentActivityList } from '@/components/stats/RecentActivityList';
import { Target, Flame, TrendingUp, CheckSquare } from 'lucide-react';

export default async function DashboardPage() {
  const result = await getUserStats();

  if (!result.ok) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-red-500">Failed to load stats: {result.error.message}</p>
      </div>
    );
  }

  const stats = result.data;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          testId="stat-total-answered"
          label="Total Answered"
          value={stats.totalAnswered}
          icon={<CheckSquare className="w-6 h-6" />}
        />

        <StatCard
          testId="stat-accuracy"
          label="Overall Accuracy"
          value={`${Math.round(stats.accuracyOverall * 100)}%`}
          icon={<Target className="w-6 h-6" />}
        />

        <StatCard
          testId="stat-streak"
          label="Current Streak"
          value={`${stats.currentStreakDays} day${stats.currentStreakDays !== 1 ? 's' : ''}`}
          icon={<Flame className="w-6 h-6" />}
        />

        <StatCard
          testId="stat-7days"
          label="Last 7 Days"
          value={`${Math.round(stats.accuracyLast7Days * 100)}%`}
          sublabel={`${stats.answeredLast7Days} answered`}
          icon={<TrendingUp className="w-6 h-6" />}
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <RecentActivityList activities={stats.recentActivity} />
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
pnpm test lib/stats/computeStats.test.ts
pnpm test:integration tests/integration/stats.integration.test.ts
pnpm test:e2e tests/e2e/dashboard.spec.ts
```

---

## Definition of Done

- [ ] All unit tests pass (stat computations)
- [ ] All integration tests pass (DB queries)
- [ ] All E2E tests pass (dashboard flow)
- [ ] Stats are computed correctly from attempts data
- [ ] Streak logic handles edge cases (UTC, month boundaries)
- [ ] Last 7 days uses correct time window
- [ ] Recent activity shows last 20 attempts
- [ ] Dashboard loads fast (server-side rendering)
- [ ] All changes committed with atomic commits

---

## Files Checklist

### Create
- [ ] `lib/stats/computeStats.ts`
- [ ] `lib/stats/computeStats.test.ts`
- [ ] `app/(app)/app/_actions/stats.actions.ts`
- [ ] `app/(app)/app/dashboard/page.tsx`
- [ ] `components/stats/StatCard.tsx`
- [ ] `components/stats/RecentActivityList.tsx`
- [ ] `tests/integration/stats.integration.test.ts`
- [ ] `tests/e2e/dashboard.spec.ts`

---

## Anti-Patterns to Avoid

1. **NO storing computed stats** - Always calculate from attempts
2. **NO local timezone for streak** - Use UTC consistently
3. **NO floating point display issues** - Round percentages properly
4. **NO N+1 queries for recent activity** - Use single join query
5. **NO unbounded queries** - Limit streak calculation to 60 days
