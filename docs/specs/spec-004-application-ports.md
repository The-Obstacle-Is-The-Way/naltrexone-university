# SPEC-004: Application Ports

**Status:** Ready
**Layer:** Application
**Dependencies:** SPEC-001 (Entities), SPEC-002 (Value Objects)
**Implements:** ADR-001, ADR-007

---

## Objective

Define interface contracts (ports) that outer layers must implement. This is the **Dependency Inversion Principle** in action: high-level modules define abstractions, low-level modules provide implementations.

---

## Files to Create

```
src/application/
├── ports/
│   ├── repositories.ts
│   ├── gateways.ts
│   └── index.ts
├── errors/
│   └── application-errors.ts
└── index.ts
```

---

## Design Pattern: Dependency Inversion

```
┌─────────────────────────────────────────────────┐
│         APPLICATION LAYER (defines)             │
│                                                 │
│   QuestionRepository (interface)                │
│   AttemptRepository (interface)                 │
│   AuthGateway (interface)                       │
│   PaymentGateway (interface)                    │
│                                                 │
└─────────────────────────────────────────────────┘
                    ▲
                    │ implements
                    │
┌─────────────────────────────────────────────────┐
│         ADAPTERS LAYER (implements)             │
│                                                 │
│   DrizzleQuestionRepository                     │
│   DrizzleAttemptRepository                      │
│   ClerkAuthGateway                              │
│   StripePaymentGateway                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Test First

### File: `src/application/ports/repositories.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { QuestionRepository, AttemptRepository, UserRepository } from './repositories';

describe('Repository Interfaces', () => {
  // These tests verify the interface contracts by creating mock implementations
  // Real tests happen at the adapter layer with real implementations

  it('QuestionRepository has required methods', () => {
    const mockRepo: QuestionRepository = {
      findById: async () => null,
      findBySlug: async () => null,
      findPublished: async () => [],
      findPublishedByFilters: async () => [],
      findWithChoices: async () => null,
    };

    expect(mockRepo.findById).toBeDefined();
    expect(mockRepo.findPublished).toBeDefined();
  });

  it('AttemptRepository has required methods', () => {
    const mockRepo: AttemptRepository = {
      create: async () => ({ id: 'a1' } as any),
      findByUser: async () => [],
      findBySession: async () => [],
      countByUser: async () => 0,
      countCorrectByUser: async () => 0,
    };

    expect(mockRepo.create).toBeDefined();
    expect(mockRepo.findByUser).toBeDefined();
  });

  it('UserRepository has required methods', () => {
    const mockRepo: UserRepository = {
      findById: async () => null,
      findByClerkId: async () => null,
      upsertByClerkId: async () => ({ id: 'u1' } as any),
    };

    expect(mockRepo.upsertByClerkId).toBeDefined();
  });
});
```

### File: `src/application/ports/gateways.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { AuthGateway, PaymentGateway } from './gateways';

describe('Gateway Interfaces', () => {
  it('AuthGateway has required methods', () => {
    const mockGateway: AuthGateway = {
      getCurrentUser: async () => null,
      requireUser: async () => ({ id: 'u1' } as any),
      getClerkUserId: async () => null,
    };

    expect(mockGateway.getCurrentUser).toBeDefined();
    expect(mockGateway.requireUser).toBeDefined();
  });

  it('PaymentGateway has required methods', () => {
    const mockGateway: PaymentGateway = {
      createCheckoutSession: async () => ({ url: 'https://...' }),
      createPortalSession: async () => ({ url: 'https://...' }),
      constructWebhookEvent: async () => ({ type: 'test' } as any),
    };

    expect(mockGateway.createCheckoutSession).toBeDefined();
    expect(mockGateway.createPortalSession).toBeDefined();
  });
});
```

---

## Implementation

### File: `src/application/ports/repositories.ts`

```typescript
import type { User, Question, Choice, Attempt, Subscription, PracticeSession, Bookmark, Tag } from '@/src/domain/entities';
import type { QuestionDifficulty, QuestionStatus } from '@/src/domain/value-objects';

/**
 * User repository port
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByClerkId(clerkUserId: string): Promise<User | null>;
  upsertByClerkId(clerkUserId: string, email: string): Promise<User>;
}

/**
 * Question with its choices
 */
export type QuestionWithChoices = Question & {
  choices: readonly Choice[];
};

/**
 * Question filter parameters
 */
export type QuestionFilters = {
  tagSlugs?: readonly string[];
  difficulties?: readonly QuestionDifficulty[];
  excludeIds?: readonly string[];
};

/**
 * Question repository port
 */
export interface QuestionRepository {
  findById(id: string): Promise<Question | null>;
  findBySlug(slug: string): Promise<Question | null>;
  findPublished(limit?: number): Promise<readonly Question[]>;
  findPublishedByFilters(filters: QuestionFilters, limit?: number): Promise<readonly Question[]>;
  findWithChoices(questionId: string): Promise<QuestionWithChoices | null>;
}

/**
 * Choice repository port
 */
export interface ChoiceRepository {
  findByQuestionId(questionId: string): Promise<readonly Choice[]>;
  findCorrectByQuestionId(questionId: string): Promise<Choice | null>;
}

/**
 * Attempt creation input
 */
export type CreateAttemptInput = {
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
};

/**
 * Attempt repository port
 */
export interface AttemptRepository {
  create(input: CreateAttemptInput): Promise<Attempt>;
  findByUser(userId: string, limit?: number): Promise<readonly Attempt[]>;
  findBySession(sessionId: string): Promise<readonly Attempt[]>;
  countByUser(userId: string): Promise<number>;
  countCorrectByUser(userId: string): Promise<number>;
}

/**
 * Subscription repository port
 */
export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
  upsert(userId: string, data: Omit<Subscription, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Subscription>;
  updateStatus(userId: string, status: string): Promise<void>;
}

/**
 * Practice session creation input
 */
export type CreateSessionInput = {
  userId: string;
  mode: 'tutor' | 'exam';
  params: {
    count: number;
    tagSlugs: readonly string[];
    difficulties: readonly string[];
    questionIds: readonly string[];
  };
};

/**
 * Practice session repository port
 */
export interface SessionRepository {
  create(input: CreateSessionInput): Promise<PracticeSession>;
  findById(id: string): Promise<PracticeSession | null>;
  findByIdAndUser(id: string, userId: string): Promise<PracticeSession | null>;
  endSession(id: string): Promise<PracticeSession>;
}

/**
 * Bookmark repository port
 */
export interface BookmarkRepository {
  exists(userId: string, questionId: string): Promise<boolean>;
  create(userId: string, questionId: string): Promise<Bookmark>;
  delete(userId: string, questionId: string): Promise<void>;
  findByUser(userId: string): Promise<readonly Bookmark[]>;
}

/**
 * Tag repository port
 */
export interface TagRepository {
  findBySlug(slug: string): Promise<Tag | null>;
  findBySlugs(slugs: readonly string[]): Promise<readonly Tag[]>;
  findAll(): Promise<readonly Tag[]>;
}
```

### File: `src/application/ports/gateways.ts`

```typescript
import type { User } from '@/src/domain/entities';

/**
 * Authentication gateway port
 * Abstracts Clerk or any auth provider
 */
export interface AuthGateway {
  /**
   * Get current authenticated user or null
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Get current user or throw ApplicationError
   */
  requireUser(): Promise<User>;

  /**
   * Get raw auth provider ID (e.g., Clerk user ID)
   */
  getClerkUserId(): Promise<string | null>;
}

/**
 * Checkout session result
 */
export type CheckoutSessionResult = {
  url: string;
};

/**
 * Portal session result
 */
export type PortalSessionResult = {
  url: string;
};

/**
 * Checkout session input
 */
export type CreateCheckoutInput = {
  userId: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
};

/**
 * Portal session input
 */
export type CreatePortalInput = {
  customerId: string;
  returnUrl: string;
};

/**
 * Payment gateway port
 * Abstracts Stripe or any payment provider
 */
export interface PaymentGateway {
  /**
   * Create a checkout session for subscription
   */
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult>;

  /**
   * Create a billing portal session
   */
  createPortalSession(input: CreatePortalInput): Promise<PortalSessionResult>;

  /**
   * Verify and parse webhook event
   */
  constructWebhookEvent(payload: string, signature: string): Promise<WebhookEvent>;
}

/**
 * Webhook event types we handle
 */
export type WebhookEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted';

/**
 * Parsed webhook event
 */
export type WebhookEvent = {
  id: string;
  type: WebhookEventType | string;
  data: unknown;
};
```

### File: `src/application/ports/index.ts`

```typescript
export type {
  UserRepository,
  QuestionRepository,
  QuestionWithChoices,
  QuestionFilters,
  ChoiceRepository,
  AttemptRepository,
  CreateAttemptInput,
  SubscriptionRepository,
  SessionRepository,
  CreateSessionInput,
  BookmarkRepository,
  TagRepository,
} from './repositories';

export type {
  AuthGateway,
  PaymentGateway,
  CheckoutSessionResult,
  PortalSessionResult,
  CreateCheckoutInput,
  CreatePortalInput,
  WebhookEvent,
  WebhookEventType,
} from './gateways';
```

### File: `src/application/errors/application-errors.ts`

```typescript
/**
 * Application-level error codes
 */
export type ApplicationErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN';

/**
 * Application error class
 * Thrown by use cases, caught by controllers
 */
export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

/**
 * Factory functions for common errors
 */
export const Errors = {
  unauthenticated: (message = 'Authentication required') =>
    new ApplicationError('UNAUTHENTICATED', message),

  unsubscribed: (message = 'Active subscription required') =>
    new ApplicationError('UNSUBSCRIBED', message),

  notFound: (resource: string) =>
    new ApplicationError('NOT_FOUND', `${resource} not found`),

  conflict: (message: string) =>
    new ApplicationError('CONFLICT', message),

  validation: (fieldErrors: Record<string, string[]>) =>
    new ApplicationError('VALIDATION_ERROR', 'Validation failed', fieldErrors),

  forbidden: (message = 'Access denied') =>
    new ApplicationError('FORBIDDEN', message),
};
```

### File: `src/application/index.ts`

```typescript
export * from './ports';
export * from './errors/application-errors';
```

---

## Quality Gate

```bash
pnpm test src/application/
```

---

## Definition of Done

- [ ] All repository interfaces defined
- [ ] All gateway interfaces defined
- [ ] ApplicationError class with typed codes
- [ ] Error factory functions
- [ ] Type-only imports from domain layer
- [ ] All tests pass
