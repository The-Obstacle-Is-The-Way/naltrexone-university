# ADR-002: Domain Model

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

We need to define the core domain model for Addiction Boards. This model must:

1. Capture the essential business concepts of a medical board exam question bank
2. Be independent of any framework or database
3. Enforce business invariants at the type level where possible
4. Support the use cases defined in our requirements

## Decision

We define the following **Entities**, **Value Objects**, and **Domain Services**.

### Entities

Entities have identity that persists over time. Two entities with the same attributes but different IDs are different entities.

#### User

```typescript
// src/domain/entities/user.ts
export type User = {
  readonly id: string;           // Our internal UUID
  readonly email: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

**Invariants:**
- `id` is a valid UUID
- `email` is a valid email format

**Note:** External auth provider IDs (e.g., Clerk user ID) are stored ONLY in the persistence layer (`users.clerk_user_id` column). The domain entity does not know about external identity providers. Mapping happens at the adapter boundary.

#### Question

```typescript
// src/domain/entities/question.ts
export type Question = {
  readonly id: string;
  readonly slug: string;
  readonly stemMd: string;
  readonly explanationMd: string;
  readonly difficulty: QuestionDifficulty;
  readonly status: QuestionStatus;
  readonly choices: readonly Choice[];
  readonly tags: readonly Tag[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

**Invariants:**
- Must have 2-6 choices
- Exactly one choice must be correct
- Choice labels must be unique within the question
- Slug must be kebab-case and unique system-wide
- `stemMd` and `explanationMd` must be non-empty

#### Choice

```typescript
// src/domain/entities/choice.ts
export type Choice = {
  readonly id: string;
  readonly questionId: string;
  readonly label: ChoiceLabel;      // 'A' | 'B' | 'C' | 'D' | 'E'
  readonly textMd: string;
  readonly isCorrect: boolean;
  readonly sortOrder: number;       // 1-based
};
```

**Invariants:**
- `label` is A-E
- `textMd` is non-empty
- `sortOrder` is positive integer

#### Attempt

```typescript
// src/domain/entities/attempt.ts
export type Attempt = {
  readonly id: string;
  readonly userId: string;
  readonly questionId: string;
  readonly practiceSessionId: string | null;
  readonly selectedChoiceId: string;
  readonly isCorrect: boolean;
  readonly timeSpentSeconds: number;
  readonly answeredAt: Date;
};
```

**Invariants:**
- `timeSpentSeconds` >= 0
- `answeredAt` is a valid timestamp

#### Subscription

```typescript
// src/domain/entities/subscription.ts
export type Subscription = {
  readonly id: string;
  readonly userId: string;
  readonly plan: SubscriptionPlan;          // Domain concept: which plan
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

**Invariants:**
- `currentPeriodEnd` is a valid future or past date
- One subscription per user (enforced at adapter level)

**Note:** External payment provider IDs (e.g., Stripe subscription ID, Stripe price ID) are stored ONLY in the persistence layer (`stripe_subscriptions.stripe_subscription_id`, `stripe_subscriptions.price_id` columns). The domain entity uses a domain-level `SubscriptionPlan` value object instead of vendor-specific price IDs. Mapping between `SubscriptionPlan` and Stripe price IDs happens at the adapter boundary.

#### PracticeSession

```typescript
// src/domain/entities/practice-session.ts
export type PracticeSession = {
  readonly id: string;
  readonly userId: string;
  readonly mode: PracticeMode;
  readonly questionIds: readonly string[];  // Ordered list
  readonly tagFilters: readonly string[];   // Tag slugs used
  readonly difficultyFilters: readonly QuestionDifficulty[];
  readonly startedAt: Date;
  readonly endedAt: Date | null;
};
```

**Invariants:**
- `questionIds` is non-empty
- `endedAt` is null or >= `startedAt`

#### Bookmark

```typescript
// src/domain/entities/bookmark.ts
export type Bookmark = {
  readonly userId: string;
  readonly questionId: string;
  readonly createdAt: Date;
};
```

**Invariants:**
- Composite identity: (userId, questionId)

#### Tag

```typescript
// src/domain/entities/tag.ts
export type Tag = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: TagKind;
};
```

**Invariants:**
- `slug` is kebab-case and unique

### Value Objects

Value Objects have no identity. Two VOs with the same attributes are equal.

#### QuestionDifficulty

```typescript
// src/domain/value-objects/question-difficulty.ts
export const AllDifficulties = ['easy', 'medium', 'hard'] as const;

export type QuestionDifficulty = typeof AllDifficulties[number];

export function isValidDifficulty(value: string): value is QuestionDifficulty {
  return AllDifficulties.includes(value as QuestionDifficulty);
}
```

#### QuestionStatus

```typescript
// src/domain/value-objects/question-status.ts
export const AllQuestionStatuses = ['draft', 'published', 'archived'] as const;

export type QuestionStatus = typeof AllQuestionStatuses[number];

export function isValidQuestionStatus(value: string): value is QuestionStatus {
  return AllQuestionStatuses.includes(value as QuestionStatus);
}

export function isVisibleStatus(status: QuestionStatus): boolean {
  return status === 'published';
}
```

#### SubscriptionStatus

```typescript
// src/domain/value-objects/subscription-status.ts
export const AllSubscriptionStatuses = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;

export type SubscriptionStatus = typeof AllSubscriptionStatuses[number];

export function isValidSubscriptionStatus(
  value: string,
): value is SubscriptionStatus {
  return AllSubscriptionStatuses.includes(value as SubscriptionStatus);
}

export const EntitledStatuses: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
];

export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return EntitledStatuses.includes(status);
}
```

#### PracticeMode

```typescript
// src/domain/value-objects/practice-mode.ts
export const AllPracticeModes = ['tutor', 'exam'] as const;

export type PracticeMode = typeof AllPracticeModes[number];

export function isValidPracticeMode(value: string): value is PracticeMode {
  return AllPracticeModes.includes(value as PracticeMode);
}

export function shouldShowExplanation(
  mode: PracticeMode,
  sessionEnded: boolean,
): boolean {
  if (mode === 'tutor') return true;
  return sessionEnded;
}
```

#### ChoiceLabel

```typescript
// src/domain/value-objects/choice-label.ts
export const AllChoiceLabels = ['A', 'B', 'C', 'D', 'E'] as const;

export type ChoiceLabel = typeof AllChoiceLabels[number];

export function isValidChoiceLabel(value: string): value is ChoiceLabel {
  return AllChoiceLabels.includes(value as ChoiceLabel);
}
```

#### TagKind

```typescript
// src/domain/value-objects/tag-kind.ts
export const AllTagKinds = [
  'domain', // exam blueprint domain
  'topic', // clinical topic
  'substance', // drug/substance class
  'treatment', // treatment modality
  'diagnosis', // DSM/ICD category
] as const;

export type TagKind = typeof AllTagKinds[number];

export function isValidTagKind(value: string): value is TagKind {
  return AllTagKinds.includes(value as TagKind);
}
```

#### SubscriptionPlan

```typescript
// src/domain/value-objects/subscription-plan.ts
export const AllSubscriptionPlans = ['monthly', 'annual'] as const;

export type SubscriptionPlan = typeof AllSubscriptionPlans[number];

export function isValidSubscriptionPlan(
  value: string,
): value is SubscriptionPlan {
  return AllSubscriptionPlans.includes(value as SubscriptionPlan);
}
```

**Note:** This is the domain's concept of a plan. The mapping to vendor-specific Stripe price IDs (e.g., `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`, `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`) happens at the adapter boundary via configuration.

### Domain Services

Pure functions that implement business rules operating on entities.

#### Grading Service

```typescript
// src/domain/services/grading.ts
import type { Question, Choice } from '../entities';
import { DomainError } from '../errors/domain-errors';

export type GradeResult = {
  readonly isCorrect: boolean;
  readonly correctChoiceId: string;
  readonly correctLabel: ChoiceLabel;
};

/**
 * Grade an answer submission.
 * Pure function - no side effects.
 */
export function gradeAnswer(
  question: Question,
  selectedChoiceId: string
): GradeResult {
  const correctChoice = question.choices.find(c => c.isCorrect);

  if (!correctChoice) {
    throw new DomainError(
      'INVALID_QUESTION',
      `Question ${question.id} has no correct choice`
    );
  }

  const selectedChoice = question.choices.find(c => c.id === selectedChoiceId);

  if (!selectedChoice) {
    throw new DomainError(
      'INVALID_CHOICE',
      `Choice ${selectedChoiceId} does not belong to question ${question.id}`
    );
  }

  return {
    isCorrect: selectedChoiceId === correctChoice.id,
    correctChoiceId: correctChoice.id,
    correctLabel: correctChoice.label,
  };
}
```

#### Entitlement Service

```typescript
// src/domain/services/entitlement.ts
import type { Subscription } from '../entities';
import { SubscriptionStatus, EntitledStatuses } from '../value-objects';

/**
 * Check if a subscription grants access.
 * Pure function - no side effects.
 */
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date()
): boolean {
  if (!subscription) {
    return false;
  }

  if (!EntitledStatuses.includes(subscription.status)) {
    return false;
  }

  if (subscription.currentPeriodEnd <= now) {
    return false;
  }

  return true;
}
```

#### Statistics Service

```typescript
// src/domain/services/statistics.ts
import type { Attempt } from '../entities';

export type UserStats = {
  readonly totalAnswered: number;
  readonly totalCorrect: number;
  readonly accuracyOverall: number;        // 0-1
  readonly answeredLast7Days: number;
  readonly accuracyLast7Days: number;      // 0-1
  readonly currentStreakDays: number;
};

/**
 * Compute accuracy from counts.
 * Pure function.
 */
export function computeAccuracy(total: number, correct: number): number {
  if (total === 0) return 0;
  return correct / total;
}

/**
 * Compute consecutive day streak ending today.
 * Pure function.
 */
export function computeStreak(attemptDates: readonly Date[], today: Date): number {
  if (attemptDates.length === 0) return 0;

  const toDateString = (d: Date) => d.toISOString().split('T')[0];
  const uniqueDates = new Set(attemptDates.map(toDateString));

  const todayStr = toDateString(today);
  if (!uniqueDates.has(todayStr)) return 0;

  let streak = 0;
  let checkDate = new Date(today);

  while (uniqueDates.has(toDateString(checkDate))) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

/**
 * Filter attempts within a time window.
 * Pure function.
 */
export function filterAttemptsInWindow(
  attempts: readonly Attempt[],
  days: number,
  now: Date
): readonly Attempt[] {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return attempts.filter(a => a.answeredAt >= cutoff);
}
```

#### Session Service

```typescript
// src/domain/services/session.ts
import type { PracticeSession, Attempt } from '../entities';

export type SessionProgress = {
  readonly total: number;
  readonly answered: number;
  readonly currentIndex: number;  // 0-based
  readonly isComplete: boolean;
};

export type SessionSummary = {
  readonly answered: number;
  readonly correct: number;
  readonly accuracy: number;
  readonly durationSeconds: number;
};

/**
 * Compute session progress.
 * Pure function.
 */
export function computeSessionProgress(
  session: PracticeSession,
  answeredQuestionIds: readonly string[]
): SessionProgress {
  const answered = answeredQuestionIds.length;
  const total = session.questionIds.length;

  return {
    total,
    answered,
    currentIndex: answered,
    isComplete: answered >= total,
  };
}

/**
 * Determine if explanation should be shown.
 * Pure function.
 */
export function shouldShowExplanation(
  session: PracticeSession | null
): boolean {
  // No session = tutor mode (ad-hoc practice)
  if (!session) return true;

  // Tutor mode = immediate explanation
  if (session.mode === 'tutor') return true;

  // Exam mode = only after session ends
  return session.endedAt !== null;
}

/**
 * Compute session summary.
 * Pure function.
 */
export function computeSessionSummary(
  session: PracticeSession,
  attempts: readonly Attempt[]
): SessionSummary {
  if (!session.endedAt) {
    throw new DomainError(
      'INVALID_SESSION',
      'Cannot compute summary for unfinished session'
    );
  }

  const answered = attempts.length;
  const correct = attempts.filter(a => a.isCorrect).length;
  const accuracy = answered > 0 ? correct / answered : 0;
  const durationSeconds = Math.floor(
    (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
  );

  return { answered, correct, accuracy, durationSeconds };
}
```

#### Shuffle Service

```typescript
// src/domain/services/shuffle.ts

/**
 * Simple string hash (djb2 algorithm).
 * Pure TypeScript - NO external dependencies.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Create deterministic seed from user and timestamp.
 * Pure function - no Node.js dependencies.
 */
export function createSeed(userId: string, timestamp: number): number {
  const input = `${userId}:${timestamp}`;
  return hashString(input);
}

/**
 * Fisher-Yates shuffle with seeded PRNG.
 * Pure function.
 */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
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
```

**Note:** We use a pure TypeScript hash function (djb2) instead of Node's `crypto` module. The domain layer must have ZERO external dependencies. If cryptographic-strength randomness is needed for security purposes, that logic belongs in the adapters layer, not the domain.

### Domain Errors

```typescript
// src/domain/errors/domain-errors.ts
export type DomainErrorCode =
  | 'INVALID_QUESTION'
  | 'INVALID_CHOICE'
  | 'INVALID_SESSION'
  | 'SESSION_ALREADY_ENDED'
  | 'NO_QUESTIONS_MATCH';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
```

## Aggregate Boundaries

Following DDD principles, we define aggregates:

1. **Question Aggregate** — Question is the root; Choices belong to it
2. **User Aggregate** — User is the root; Subscription belongs to it
3. **PracticeSession Aggregate** — Session is the root; Attempts belong to it

Cross-aggregate references use IDs, not object references.

## Consequences

### Positive

1. **Framework Independence** — Domain has zero external dependencies
2. **Testability** — All domain logic is pure functions, trivially testable
3. **Type Safety** — Value objects prevent invalid states
4. **Explicit Business Rules** — Rules are code, not comments

### Negative

1. **Verbosity** — More types to define upfront
2. **Mapping** — Must convert to/from database representations

### Mitigations

- Use barrel exports (`src/domain/index.ts`) for clean imports
- Create mapper utilities in adapters layer

## References

- Eric Evans, "Domain-Driven Design" (2003)
- Vaughn Vernon, "Implementing Domain-Driven Design" (2013)
- Martin Fowler, "Patterns of Enterprise Application Architecture" (2002)
