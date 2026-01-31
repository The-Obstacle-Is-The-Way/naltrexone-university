# SPEC-002: Value Objects

**Status:** Ready
**Layer:** Domain (Innermost)
**Dependencies:** None
**Implements:** ADR-001, ADR-002

---

## Objective

Define constrained types (value objects) that enforce business rules at the type level. These are immutable, have no identity, and are compared by value.

---

## Files to Create

```
src/domain/value-objects/
├── subscription-status.ts
├── question-difficulty.ts
├── question-status.ts
├── practice-mode.ts
├── choice-label.ts
├── tag-kind.ts
└── index.ts
```

---

## Test First

### File: `src/domain/value-objects/subscription-status.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  isEntitledStatus,
  EntitledStatuses,
  AllSubscriptionStatuses,
} from './subscription-status';

describe('SubscriptionStatus', () => {
  describe('isEntitledStatus', () => {
    it('returns true for active', () => {
      expect(isEntitledStatus('active')).toBe(true);
    });

    it('returns true for trialing', () => {
      expect(isEntitledStatus('trialing')).toBe(true);
    });

    it('returns false for canceled', () => {
      expect(isEntitledStatus('canceled')).toBe(false);
    });

    it('returns false for past_due', () => {
      expect(isEntitledStatus('past_due')).toBe(false);
    });

    it('returns false for unpaid', () => {
      expect(isEntitledStatus('unpaid')).toBe(false);
    });
  });

  describe('EntitledStatuses', () => {
    it('contains exactly active and trialing', () => {
      expect(EntitledStatuses).toEqual(['active', 'trialing']);
    });
  });

  describe('AllSubscriptionStatuses', () => {
    it('contains all 8 Stripe statuses', () => {
      expect(AllSubscriptionStatuses).toHaveLength(8);
    });
  });
});
```

### File: `src/domain/value-objects/question-difficulty.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { AllDifficulties, isValidDifficulty } from './question-difficulty';

describe('QuestionDifficulty', () => {
  it('has exactly 3 levels', () => {
    expect(AllDifficulties).toEqual(['easy', 'medium', 'hard']);
  });

  it('validates known difficulties', () => {
    expect(isValidDifficulty('easy')).toBe(true);
    expect(isValidDifficulty('medium')).toBe(true);
    expect(isValidDifficulty('hard')).toBe(true);
  });

  it('rejects unknown difficulties', () => {
    expect(isValidDifficulty('extreme')).toBe(false);
  });
});
```

### File: `src/domain/value-objects/practice-mode.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { AllPracticeModes, shouldShowExplanation } from './practice-mode';

describe('PracticeMode', () => {
  it('has tutor and exam modes', () => {
    expect(AllPracticeModes).toEqual(['tutor', 'exam']);
  });

  describe('shouldShowExplanation', () => {
    it('returns true for tutor mode', () => {
      expect(shouldShowExplanation('tutor', false)).toBe(true);
    });

    it('returns false for exam mode when not ended', () => {
      expect(shouldShowExplanation('exam', false)).toBe(false);
    });

    it('returns true for exam mode when ended', () => {
      expect(shouldShowExplanation('exam', true)).toBe(true);
    });
  });
});
```

---

## Implementation

### File: `src/domain/value-objects/subscription-status.ts`

```typescript
/**
 * Stripe subscription status values
 * @see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
 */
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

/**
 * Statuses that grant access to premium features
 */
export const EntitledStatuses: readonly SubscriptionStatus[] = ['active', 'trialing'];

/**
 * Check if a status grants entitlement
 */
export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return EntitledStatuses.includes(status);
}
```

### File: `src/domain/value-objects/question-difficulty.ts`

```typescript
/**
 * Question difficulty levels
 */
export const AllDifficulties = ['easy', 'medium', 'hard'] as const;

export type QuestionDifficulty = typeof AllDifficulties[number];

/**
 * Type guard for difficulty validation
 */
export function isValidDifficulty(value: string): value is QuestionDifficulty {
  return AllDifficulties.includes(value as QuestionDifficulty);
}
```

### File: `src/domain/value-objects/question-status.ts`

```typescript
/**
 * Question publication status
 */
export const AllQuestionStatuses = ['draft', 'published', 'archived'] as const;

export type QuestionStatus = typeof AllQuestionStatuses[number];

/**
 * Only published questions are shown to users
 */
export function isVisibleStatus(status: QuestionStatus): boolean {
  return status === 'published';
}
```

### File: `src/domain/value-objects/practice-mode.ts`

```typescript
/**
 * Practice session modes
 */
export const AllPracticeModes = ['tutor', 'exam'] as const;

export type PracticeMode = typeof AllPracticeModes[number];

/**
 * Determine if explanation should be shown based on mode and session state
 * - Tutor: always show immediately
 * - Exam: only show after session ends
 */
export function shouldShowExplanation(mode: PracticeMode, sessionEnded: boolean): boolean {
  if (mode === 'tutor') return true;
  return sessionEnded;
}
```

### File: `src/domain/value-objects/choice-label.ts`

```typescript
/**
 * Valid choice labels (A through E)
 */
export const AllChoiceLabels = ['A', 'B', 'C', 'D', 'E'] as const;

export type ChoiceLabel = typeof AllChoiceLabels[number];

/**
 * Validate choice label
 */
export function isValidChoiceLabel(value: string): value is ChoiceLabel {
  return AllChoiceLabels.includes(value as ChoiceLabel);
}
```

### File: `src/domain/value-objects/tag-kind.ts`

```typescript
/**
 * Tag categorization types
 */
export const AllTagKinds = [
  'domain',     // exam blueprint area
  'topic',      // clinical topic
  'substance',  // alcohol/opioids/etc
  'treatment',  // meds/psychosocial
  'diagnosis',  // DSM/ICD category
] as const;

export type TagKind = typeof AllTagKinds[number];
```

### File: `src/domain/value-objects/index.ts`

```typescript
export {
  type SubscriptionStatus,
  AllSubscriptionStatuses,
  EntitledStatuses,
  isEntitledStatus,
} from './subscription-status';

export {
  type QuestionDifficulty,
  AllDifficulties,
  isValidDifficulty,
} from './question-difficulty';

export {
  type QuestionStatus,
  AllQuestionStatuses,
  isVisibleStatus,
} from './question-status';

export {
  type PracticeMode,
  AllPracticeModes,
  shouldShowExplanation,
} from './practice-mode';

export {
  type ChoiceLabel,
  AllChoiceLabels,
  isValidChoiceLabel,
} from './choice-label';

export {
  type TagKind,
  AllTagKinds,
} from './tag-kind';
```

---

## Quality Gate

```bash
pnpm test src/domain/value-objects/
```

---

## Definition of Done

- [ ] All value objects defined with const arrays
- [ ] Type guards for runtime validation
- [ ] Business logic functions (isEntitledStatus, shouldShowExplanation)
- [ ] Zero external dependencies
- [ ] All tests pass
