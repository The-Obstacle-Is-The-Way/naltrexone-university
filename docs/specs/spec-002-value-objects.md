# SPEC-002: Value Objects

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Domain (Innermost)
**Dependencies:** None
**Implements:** ADR-001, ADR-002

---

## Objective

Define constrained types (value objects) that enforce business rules at the type level. These are immutable, have no identity, and are compared by value.

---

## Files to Create

```text
src/domain/value-objects/
├── subscription-plan.ts
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

### File: `src/domain/value-objects/subscription-plan.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { AllSubscriptionPlans, isValidSubscriptionPlan } from './subscription-plan';

describe('SubscriptionPlan', () => {
  it('has monthly and annual plans', () => {
    expect(AllSubscriptionPlans).toEqual(['monthly', 'annual']);
  });

  it('validates known plans', () => {
    expect(isValidSubscriptionPlan('monthly')).toBe(true);
    expect(isValidSubscriptionPlan('annual')).toBe(true);
  });

  it('rejects unknown plans', () => {
    expect(isValidSubscriptionPlan('weekly')).toBe(false);
  });
});
```

### File: `src/domain/value-objects/subscription-status.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  isValidSubscriptionStatus,
  isEntitledStatus,
  EntitledStatuses,
  AllSubscriptionStatuses,
} from './subscription-status';

describe('SubscriptionStatus', () => {
  it('contains all 8 Stripe subscription statuses', () => {
    expect(AllSubscriptionStatuses).toEqual([
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
    ]);
  });

  describe('isValidSubscriptionStatus', () => {
    it('returns true for known statuses', () => {
      expect(isValidSubscriptionStatus('active')).toBe(true);
      expect(isValidSubscriptionStatus('trialing')).toBe(true);
      expect(isValidSubscriptionStatus('canceled')).toBe(true);
    });

    it('returns false for unknown status', () => {
      expect(isValidSubscriptionStatus('expired')).toBe(false);
    });
  });

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
import {
  AllPracticeModes,
  isValidPracticeMode,
  shouldShowExplanationForMode,
} from './practice-mode';

describe('PracticeMode', () => {
  it('has tutor and exam modes', () => {
    expect(AllPracticeModes).toEqual(['tutor', 'exam']);
  });

  it('validates known modes', () => {
    expect(isValidPracticeMode('tutor')).toBe(true);
    expect(isValidPracticeMode('exam')).toBe(true);
  });

  it('rejects unknown modes', () => {
    expect(isValidPracticeMode('quiz')).toBe(false);
  });

  describe('shouldShowExplanationForMode', () => {
    it('returns true for tutor mode', () => {
      expect(shouldShowExplanationForMode('tutor', false)).toBe(true);
    });

    it('returns false for exam mode when not ended', () => {
      expect(shouldShowExplanationForMode('exam', false)).toBe(false);
    });

    it('returns true for exam mode when ended', () => {
      expect(shouldShowExplanationForMode('exam', true)).toBe(true);
    });
  });
});
```

### File: `src/domain/value-objects/question-status.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  AllQuestionStatuses,
  isValidQuestionStatus,
  isVisibleStatus,
} from './question-status';

describe('QuestionStatus', () => {
  it('contains exactly draft, published, archived', () => {
    expect(AllQuestionStatuses).toEqual(['draft', 'published', 'archived']);
  });

  it('validates known statuses', () => {
    expect(isValidQuestionStatus('draft')).toBe(true);
    expect(isValidQuestionStatus('published')).toBe(true);
    expect(isValidQuestionStatus('archived')).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isValidQuestionStatus('deleted')).toBe(false);
  });

  describe('isVisibleStatus', () => {
    it('returns true only for published', () => {
      expect(isVisibleStatus('draft')).toBe(false);
      expect(isVisibleStatus('published')).toBe(true);
      expect(isVisibleStatus('archived')).toBe(false);
    });
  });
});
```

### File: `src/domain/value-objects/choice-label.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { AllChoiceLabels, isValidChoiceLabel } from './choice-label';

describe('ChoiceLabel', () => {
  it('contains exactly A through E', () => {
    expect(AllChoiceLabels).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('validates known labels', () => {
    for (const label of AllChoiceLabels) {
      expect(isValidChoiceLabel(label)).toBe(true);
    }
  });

  it('rejects unknown labels', () => {
    expect(isValidChoiceLabel('F')).toBe(false);
    expect(isValidChoiceLabel('a')).toBe(false);
  });
});
```

### File: `src/domain/value-objects/tag-kind.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { AllTagKinds, isValidTagKind } from './tag-kind';

describe('TagKind', () => {
  it('contains the canonical set of kinds', () => {
    expect(AllTagKinds).toEqual([
      'domain',
      'topic',
      'substance',
      'treatment',
      'diagnosis',
    ]);
  });

  it('validates known kinds', () => {
    for (const kind of AllTagKinds) {
      expect(isValidTagKind(kind)).toBe(true);
    }
  });

  it('rejects unknown kinds', () => {
    expect(isValidTagKind('system')).toBe(false);
  });
});
```

---

## Implementation

### File: `src/domain/value-objects/subscription-plan.ts`

```typescript
/**
 * Domain-level subscription plan identifiers.
 * These are intentionally vendor-agnostic.
 */
export const AllSubscriptionPlans = ['monthly', 'annual'] as const;

export type SubscriptionPlan = typeof AllSubscriptionPlans[number];

export function isValidSubscriptionPlan(value: string): value is SubscriptionPlan {
  return AllSubscriptionPlans.includes(value as SubscriptionPlan);
}
```

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

export function isValidSubscriptionStatus(value: string): value is SubscriptionStatus {
  return AllSubscriptionStatuses.includes(value as SubscriptionStatus);
}

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

export function isValidQuestionStatus(value: string): value is QuestionStatus {
  return AllQuestionStatuses.includes(value as QuestionStatus);
}

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

export function isValidPracticeMode(value: string): value is PracticeMode {
  return AllPracticeModes.includes(value as PracticeMode);
}

/**
 * Determine if explanation should be shown based on mode and session state
 * - Tutor: always show immediately
 * - Exam: only show after session ends
 */
export function shouldShowExplanationForMode(mode: PracticeMode, sessionEnded: boolean): boolean {
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

export function isValidTagKind(value: string): value is TagKind {
  return AllTagKinds.includes(value as TagKind);
}
```

### File: `src/domain/value-objects/index.ts`

```typescript
export {
  type SubscriptionPlan,
  AllSubscriptionPlans,
  isValidSubscriptionPlan,
} from './subscription-plan';

export {
  type SubscriptionStatus,
  AllSubscriptionStatuses,
  EntitledStatuses,
  isEntitledStatus,
  isValidSubscriptionStatus,
} from './subscription-status';

export {
  type QuestionDifficulty,
  AllDifficulties,
  isValidDifficulty,
} from './question-difficulty';

export {
  type QuestionStatus,
  AllQuestionStatuses,
  isValidQuestionStatus,
  isVisibleStatus,
} from './question-status';

export {
  type PracticeMode,
  AllPracticeModes,
  isValidPracticeMode,
  shouldShowExplanationForMode,
} from './practice-mode';

export {
  type ChoiceLabel,
  AllChoiceLabels,
  isValidChoiceLabel,
} from './choice-label';

export {
  type TagKind,
  AllTagKinds,
  isValidTagKind,
} from './tag-kind';
```

---

## Quality Gate

```bash
pnpm test --run src/domain/value-objects/
```

---

## Definition of Done

- [ ] All value objects defined with const arrays
- [ ] Type guards for runtime validation
- [ ] Business logic functions (isEntitledStatus, shouldShowExplanationForMode)
- [ ] Zero external dependencies
- [ ] All tests pass
