# SPEC-001: Domain Entities

**Status:** Ready
**Layer:** Domain (Innermost)
**Dependencies:** SPEC-002 (Value Objects)
**Implements:** ADR-001, ADR-002

---

## Objective

Define pure TypeScript entity types with zero external dependencies. These are the core business objects that the entire system revolves around.

---

## Files to Create

```
src/domain/entities/
├── user.ts
├── question.ts
├── choice.ts
├── attempt.ts
├── subscription.ts
├── practice-session.ts
├── bookmark.ts
├── tag.ts
└── index.ts
```

---

## Test First

### File: `src/domain/entities/user.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { User } from './user';

describe('User entity', () => {
  it('has required readonly properties', () => {
    const user: User = {
      id: 'uuid-123',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(user.id).toBe('uuid-123');
    expect(user.email).toBe('test@example.com');
  });
});
```

### File: `src/domain/entities/question.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { Question } from './question';

describe('Question entity', () => {
  it('has stem and explanation as markdown strings', () => {
    const question: Question = {
      id: 'q-123',
      slug: 'buprenorphine-induction',
      stemMd: '**What** is the answer?',
      explanationMd: 'The answer is B because...',
      difficulty: 'medium',
      status: 'published',
      choices: [],
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(question.stemMd).toContain('**What**');
    expect(question.status).toBe('published');
  });
});
```

---

## Implementation

### File: `src/domain/entities/user.ts`

```typescript
/**
 * User entity - represents an authenticated user
 * Maps to `users` table but has no DB knowledge
 */
export type User = {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

### File: `src/domain/entities/question.ts`

```typescript
import type { QuestionDifficulty, QuestionStatus } from '../value-objects';
import type { Choice } from './choice';
import type { Tag } from './tag';

/**
 * Question entity - a single MCQ item
 */
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

### File: `src/domain/entities/choice.ts`

```typescript
import type { ChoiceLabel } from '../value-objects';

/**
 * Choice entity - an answer option for a question
 */
export type Choice = {
  readonly id: string;
  readonly questionId: string;
  readonly label: ChoiceLabel;
  readonly textMd: string;
  readonly isCorrect: boolean;
  readonly sortOrder: number;
};
```

### File: `src/domain/entities/attempt.ts`

```typescript
/**
 * Attempt entity - a user's answer to a question
 */
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

### File: `src/domain/entities/subscription.ts`

```typescript
import type { SubscriptionPlan, SubscriptionStatus } from '../value-objects';

/**
 * Subscription entity - user's payment status
 *
 * IMPORTANT: No vendor IDs live in the domain layer.
 * Stripe subscription IDs and price IDs belong in the persistence layer only.
 */
export type Subscription = {
  readonly id: string;
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

### File: `src/domain/entities/practice-session.ts`

```typescript
import type { PracticeMode, QuestionDifficulty } from '../value-objects';

/**
 * PracticeSession entity - a study session
 */
export type PracticeSession = {
  readonly id: string;
  readonly userId: string;
  readonly mode: PracticeMode;
  readonly questionIds: readonly string[]; // ordered list (UUIDs)
  readonly tagFilters: readonly string[]; // tag slugs used for selection
  readonly difficultyFilters: readonly QuestionDifficulty[]; // filters used for selection
  readonly startedAt: Date;
  readonly endedAt: Date | null;
};
```

### File: `src/domain/entities/bookmark.ts`

```typescript
/**
 * Bookmark entity - user's saved question
 */
export type Bookmark = {
  readonly userId: string;
  readonly questionId: string;
  readonly createdAt: Date;
};
```

### File: `src/domain/entities/tag.ts`

```typescript
import type { TagKind } from '../value-objects';

/**
 * Tag entity - categorization label
 */
export type Tag = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: TagKind;
};
```

### File: `src/domain/entities/index.ts`

```typescript
export type { User } from './user';
export type { Question } from './question';
export type { Choice } from './choice';
export type { Attempt } from './attempt';
export type { Subscription } from './subscription';
export type { PracticeSession } from './practice-session';
export type { Bookmark } from './bookmark';
export type { Tag } from './tag';
```

---

## Quality Gate

```bash
pnpm test --run src/domain/entities/
```

---

## Definition of Done

- [ ] All entity types defined as readonly
- [ ] Zero external imports (only value-objects from same layer)
- [ ] Barrel export in index.ts
