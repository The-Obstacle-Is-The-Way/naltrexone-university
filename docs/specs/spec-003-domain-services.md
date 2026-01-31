# SPEC-003: Domain Services

**Status:** Ready
**Layer:** Domain (Innermost)
**Dependencies:** SPEC-001 (Entities), SPEC-002 (Value Objects)
**Implements:** ADR-001, ADR-002, ADR-003

---

## Objective

Define pure domain functions that encapsulate core business logic. These have **zero external dependencies** and are trivially testable without mocks.

---

## Files to Create

```
src/domain/services/
├── grading.ts
├── grading.test.ts
├── entitlement.ts
├── entitlement.test.ts
├── statistics.ts
├── statistics.test.ts
├── session.ts
├── session.test.ts
├── shuffle.ts
├── shuffle.test.ts
└── index.ts
```

---

## Test First

### File: `src/domain/services/grading.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { gradeAnswer } from './grading';
import type { Question, Choice } from '../entities';

describe('gradeAnswer', () => {
  const question: Question = {
    id: 'q1',
    slug: 'test',
    stemMd: 'What?',
    explanationMd: 'Because.',
    difficulty: 'medium',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const choices: Choice[] = [
    { id: 'c1', questionId: 'q1', label: 'A', textMd: 'Wrong', isCorrect: false, sortOrder: 1 },
    { id: 'c2', questionId: 'q1', label: 'B', textMd: 'Right', isCorrect: true, sortOrder: 2 },
    { id: 'c3', questionId: 'q1', label: 'C', textMd: 'Wrong', isCorrect: false, sortOrder: 3 },
  ];

  it('returns isCorrect=true when correct choice selected', () => {
    const result = gradeAnswer(question, choices, 'c2');
    expect(result.isCorrect).toBe(true);
    expect(result.correctChoiceId).toBe('c2');
  });

  it('returns isCorrect=false when incorrect choice selected', () => {
    const result = gradeAnswer(question, choices, 'c1');
    expect(result.isCorrect).toBe(false);
    expect(result.correctChoiceId).toBe('c2');
  });

  it('includes explanation from question', () => {
    const result = gradeAnswer(question, choices, 'c1');
    expect(result.explanationMd).toBe('Because.');
  });

  it('returns correct choice label', () => {
    const result = gradeAnswer(question, choices, 'c3');
    expect(result.correctLabel).toBe('B');
  });

  it('throws if no correct choice exists', () => {
    const badChoices = choices.map(c => ({ ...c, isCorrect: false }));
    expect(() => gradeAnswer(question, badChoices, 'c1')).toThrow('No correct choice');
  });

  it('throws if selected choice not found', () => {
    expect(() => gradeAnswer(question, choices, 'invalid')).toThrow('Choice not found');
  });
});
```

### File: `src/domain/services/entitlement.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { isEntitled } from './entitlement';
import type { Subscription } from '../entities';

describe('isEntitled', () => {
  const now = new Date('2026-01-31T12:00:00Z');

  const makeSubscription = (
    status: string,
    periodEnd: Date
  ): Subscription => ({
    id: 's1',
    userId: 'u1',
    stripeSubscriptionId: 'sub_123',
    status: status as any,
    priceId: 'price_123',
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('returns true for active with future period end', () => {
    const sub = makeSubscription('active', new Date('2026-03-01'));
    expect(isEntitled(sub, now)).toBe(true);
  });

  it('returns true for trialing with future period end', () => {
    const sub = makeSubscription('trialing', new Date('2026-02-15'));
    expect(isEntitled(sub, now)).toBe(true);
  });

  it('returns false for active with expired period', () => {
    const sub = makeSubscription('active', new Date('2026-01-15'));
    expect(isEntitled(sub, now)).toBe(false);
  });

  it('returns false for canceled status', () => {
    const sub = makeSubscription('canceled', new Date('2026-03-01'));
    expect(isEntitled(sub, now)).toBe(false);
  });

  it('returns false for past_due status', () => {
    const sub = makeSubscription('past_due', new Date('2026-03-01'));
    expect(isEntitled(sub, now)).toBe(false);
  });

  it('returns false for null subscription', () => {
    expect(isEntitled(null, now)).toBe(false);
  });
});
```

### File: `src/domain/services/statistics.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { computeAccuracy, computeStreak } from './statistics';

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

  it('calculates ratio correctly', () => {
    expect(computeAccuracy(4, 3)).toBeCloseTo(0.75);
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

  it('counts consecutive days', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-30T10:00:00Z'),
      new Date('2026-01-29T10:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(3);
  });

  it('breaks on gap', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-30T10:00:00Z'),
      // Gap: 2026-01-29 missing
      new Date('2026-01-28T10:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it('returns 0 if no attempt today', () => {
    const dates = [new Date('2026-01-30T10:00:00Z')];
    expect(computeStreak(dates, today)).toBe(0);
  });
});
```

### File: `src/domain/services/shuffle.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { shuffleWithSeed } from './shuffle';

describe('shuffleWithSeed', () => {
  it('is deterministic for same seed', () => {
    const items = [1, 2, 3, 4, 5];
    const result1 = shuffleWithSeed([...items], 12345);
    const result2 = shuffleWithSeed([...items], 12345);
    expect(result1).toEqual(result2);
  });

  it('differs for different seeds', () => {
    const items = [1, 2, 3, 4, 5];
    const result1 = shuffleWithSeed([...items], 111);
    const result2 = shuffleWithSeed([...items], 222);
    expect(result1).not.toEqual(result2);
  });

  it('contains all original items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffleWithSeed([...items], 999);
    expect(new Set(result)).toEqual(new Set(items));
  });

  it('handles empty array', () => {
    expect(shuffleWithSeed([], 123)).toEqual([]);
  });
});
```

---

## Implementation

### File: `src/domain/services/grading.ts`

```typescript
import type { Question, Choice } from '../entities';

export type GradeResult = {
  isCorrect: boolean;
  correctChoiceId: string;
  correctLabel: string;
  explanationMd: string;
};

/**
 * Grade an answer - pure function, no side effects
 */
export function gradeAnswer(
  question: Question,
  choices: readonly Choice[],
  selectedChoiceId: string
): GradeResult {
  const selected = choices.find(c => c.id === selectedChoiceId);
  if (!selected) {
    throw new Error(`Choice not found: ${selectedChoiceId}`);
  }

  const correct = choices.find(c => c.isCorrect);
  if (!correct) {
    throw new Error(`No correct choice for question: ${question.id}`);
  }

  return {
    isCorrect: selected.id === correct.id,
    correctChoiceId: correct.id,
    correctLabel: correct.label,
    explanationMd: question.explanationMd,
  };
}
```

### File: `src/domain/services/entitlement.ts`

```typescript
import type { Subscription } from '../entities';
import { isEntitledStatus } from '../value-objects';

/**
 * Check if subscription grants access - pure function
 */
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}
```

### File: `src/domain/services/statistics.ts`

```typescript
/**
 * Compute accuracy ratio - pure function
 */
export function computeAccuracy(total: number, correct: number): number {
  if (total === 0) return 0;
  return correct / total;
}

/**
 * Compute current streak in days - pure function
 * Streak = consecutive UTC days with attempts, ending today
 */
export function computeStreak(attemptDates: readonly Date[], now: Date): number {
  if (attemptDates.length === 0) return 0;

  const toDateString = (d: Date) => d.toISOString().split('T')[0];
  const uniqueDays = new Set(attemptDates.map(toDateString));

  const todayStr = toDateString(now);
  if (!uniqueDays.has(todayStr)) return 0;

  let streak = 0;
  let checkDate = new Date(now);

  while (uniqueDays.has(toDateString(checkDate))) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

/**
 * Filter attempts within N days - pure function
 */
export function filterAttemptsInWindow<T extends { answeredAt: Date }>(
  attempts: readonly T[],
  days: number,
  now: Date
): T[] {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return attempts.filter(a => a.answeredAt >= cutoff);
}
```

### File: `src/domain/services/session.ts`

```typescript
import type { PracticeSession, Attempt } from '../entities';
import { shouldShowExplanation as modeShowsExplanation } from '../value-objects';

export type SessionProgress = {
  current: number;
  total: number;
  isComplete: boolean;
};

/**
 * Compute session progress - pure function
 */
export function computeSessionProgress(
  session: PracticeSession,
  attemptCount: number
): SessionProgress {
  const total = session.params.questionIds.length;
  return {
    current: attemptCount,
    total,
    isComplete: attemptCount >= total,
  };
}

/**
 * Determine if explanation should be shown - pure function
 */
export function shouldShowExplanation(session: PracticeSession): boolean {
  return modeShowsExplanation(session.mode, session.endedAt !== null);
}

/**
 * Get next question ID in session - pure function
 */
export function getNextQuestionId(
  session: PracticeSession,
  answeredQuestionIds: readonly string[]
): string | null {
  const answeredSet = new Set(answeredQuestionIds);
  for (const qId of session.params.questionIds) {
    if (!answeredSet.has(qId)) return qId;
  }
  return null;
}
```

### File: `src/domain/services/shuffle.ts`

```typescript
/**
 * Fisher-Yates shuffle with seeded PRNG - pure function
 * Deterministic: same seed = same output
 */
export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let state = seed;

  // Mulberry32 PRNG
  const random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Create seed from user ID and timestamp - pure function
 */
export function createSeed(userId: string, timestamp: number): number {
  let hash = 0;
  const str = `${userId}:${timestamp}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
```

### File: `src/domain/services/index.ts`

```typescript
export { gradeAnswer, type GradeResult } from './grading';
export { isEntitled } from './entitlement';
export { computeAccuracy, computeStreak, filterAttemptsInWindow } from './statistics';
export { computeSessionProgress, shouldShowExplanation, getNextQuestionId, type SessionProgress } from './session';
export { shuffleWithSeed, createSeed } from './shuffle';
```

---

## Quality Gate

```bash
pnpm test src/domain/services/
```

---

## Definition of Done

- [ ] All services are pure functions (no side effects)
- [ ] Zero external dependencies (only domain layer imports)
- [ ] 100% test coverage
- [ ] All tests pass without mocks
- [ ] Barrel export in index.ts
