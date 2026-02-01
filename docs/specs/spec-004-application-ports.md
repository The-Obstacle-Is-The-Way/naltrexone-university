# SPEC-004: Application Ports (Interfaces)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Application
**Dependencies:** SPEC-001 (Entities), SPEC-002 (Value Objects)
**Implements:** ADR-001 (Clean Architecture), ADR-004 (Auth Boundary), ADR-005 (Payment Boundary), ADR-007 (DI)

---

## Objective

Define **ports** (interfaces + DTOs) that the Application layer depends on.

These ports MUST:

- Be framework-neutral (no Next.js, Drizzle, Clerk, Stripe imports)
- Use only primitives + domain types (`src/domain/**`)
- Be small and specific (Interface Segregation)

---

## Files to Create

```text
src/application/
├── ports/
│   ├── repositories.ts
│   ├── gateways.ts
│   └── index.ts
└── errors/
    └── application-errors.ts
```

---

## Design Rules (Non-Negotiable)

1. **No vendor IDs in domain**: domain types never include Clerk/Stripe identifiers.
2. **Ports can carry opaque external IDs**: if needed, they are just `string` values at the boundary.
3. **No SDK types cross the boundary**: e.g., `Stripe.Event` stays in adapters.
4. **Ports define behavior, not storage**: repositories expose intent-level operations.

---

## Application Errors

**File:** `src/application/errors/application-errors.ts`

```ts
export type ApplicationErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STRIPE_ERROR'
  | 'INTERNAL_ERROR';

export class ApplicationError extends Error {
  readonly _tag = 'ApplicationError' as const;

  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
```

---

## Gateway Ports

**File:** `src/application/ports/gateways.ts`

```ts
import type { User } from '@/src/domain/entities';
import type { SubscriptionPlan, SubscriptionStatus } from '@/src/domain/value-objects';

export interface AuthGateway {
  /**
   * Returns the current authenticated user (internal UUID + email), or null.
   * Implementation lives in adapters and may upsert the DB user row.
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Returns the current authenticated user or throws ApplicationError('UNAUTHENTICATED').
   */
  requireUser(): Promise<User>;
}

export type CheckoutSessionInput = {
  userId: string; // internal UUID
  stripeCustomerId: string; // opaque external id
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionOutput = { url: string };

export type PortalSessionInput = {
  stripeCustomerId: string; // opaque external id
  returnUrl: string;
};

export type PortalSessionOutput = { url: string };

export type WebhookEventResult = {
  eventId: string;
  type:
    | 'checkout.session.completed'
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | (string & {});
  subscriptionUpdate?: {
    userId: string; // internal UUID
    stripeCustomerId: string; // opaque external id
    stripeSubscriptionId: string; // opaque external id
    plan: SubscriptionPlan; // domain plan (monthly/annual)
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };
};

export interface PaymentGateway {
  createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionOutput>;

  createPortalSession(input: PortalSessionInput): Promise<PortalSessionOutput>;

  /**
   * Verifies signature and normalizes the Stripe event for the use case/controller.
   */
  processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult>;
}
```

---

## Repository Ports

**File:** `src/application/ports/repositories.ts`

```ts
import type {
  Attempt,
  Bookmark,
  PracticeSession,
  Question,
  Subscription,
  Tag,
  User,
} from '@/src/domain/entities';
import type { QuestionDifficulty, SubscriptionPlan, SubscriptionStatus } from '@/src/domain/value-objects';

export interface QuestionRepository {
  findPublishedById(id: string): Promise<Question | null>;
  findPublishedBySlug(slug: string): Promise<Question | null>;
  findPublishedByIds(ids: readonly string[]): Promise<readonly Question[]>;

  /**
   * Return candidate question ids for deterministic "next question" selection.
   *
   * Requirements:
   * - Only returns `questions.status='published'`.
   * - Applies tag/difficulty filters.
   * - Returns ids in a deterministic order (repository defines ordering).
   */
  listPublishedCandidateIds(filters: {
    tagSlugs: readonly string[];
    difficulties: readonly QuestionDifficulty[];
  }): Promise<readonly string[]>;
}

export interface AttemptRepository {
  insert(input: {
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    selectedChoiceId: string;
    isCorrect: boolean;
    timeSpentSeconds: number;
  }): Promise<Attempt>;

  findByUserId(userId: string): Promise<readonly Attempt[]>;
  findBySessionId(sessionId: string, userId: string): Promise<readonly Attempt[]>;

  /**
   * For each question id, return the most recent answeredAt (max) for this user.
   * Missing entries imply "never attempted".
   */
  findMostRecentAnsweredAtByQuestionIds(
    userId: string,
    questionIds: readonly string[],
  ): Promise<readonly { questionId: string; answeredAt: Date }[]>;
}

export interface PracticeSessionRepository {
  findByIdAndUserId(id: string, userId: string): Promise<PracticeSession | null>;
  create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown; // adapter validates + persists exact shape
  }): Promise<PracticeSession>;
  end(id: string, userId: string): Promise<PracticeSession>;
}

export interface BookmarkRepository {
  exists(userId: string, questionId: string): Promise<boolean>;
  add(userId: string, questionId: string): Promise<Bookmark>;
  remove(userId: string, questionId: string): Promise<void>;
  listByUserId(userId: string): Promise<readonly Bookmark[]>;
}

export interface TagRepository {
  listAll(): Promise<readonly Tag[]>;
}

export type SubscriptionUpsertInput = {
  userId: string;
  stripeSubscriptionId: string; // opaque external id
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null>;
  upsert(input: SubscriptionUpsertInput): Promise<void>;
}

export interface StripeCustomerRepository {
  findByUserId(userId: string): Promise<{ stripeCustomerId: string } | null>;
  insert(userId: string, stripeCustomerId: string): Promise<void>;
}

export interface StripeEventRepository {
  /**
   * Insert the event row if missing (idempotent).
   * Returns true if the row was inserted (claimed), false if it already existed.
   */
  claim(eventId: string, type: string): Promise<boolean>;

  /**
   * Lock the event row for exclusive processing and return its current state.
   *
   * IMPORTANT: This must be called inside a transaction.
   */
  lock(eventId: string): Promise<{
    processedAt: Date | null;
    error: string | null;
  }>;

  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}

export interface UserRepository {
  /**
   * Find a user by their external Clerk ID.
   */
  findByClerkId(clerkId: string): Promise<User | null>;

  /**
   * Upsert a user by their Clerk ID.
   */
  upsertByClerkId(clerkId: string, email: string): Promise<User>;
}
```

---

## Quality Gate

Ports are validated by:

- TypeScript compile (`pnpm typecheck`)
- Use case tests (SPEC-005) with fakes implementing these interfaces
