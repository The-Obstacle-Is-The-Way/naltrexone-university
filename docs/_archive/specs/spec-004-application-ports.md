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
│   ├── attempt-repository.ts
│   ├── bookmark-repository.ts
│   ├── gateways.ts
│   ├── idempotency-key-repository.ts
│   ├── logger.ts
│   ├── practice-session-repository.ts
│   ├── question-repository.ts
│   ├── repositories.ts              # Barrel re-export for repository ports
│   ├── stripe-customer-repository.ts
│   ├── stripe-event-repository.ts
│   ├── subscription-repository.ts
│   ├── tag-repository.ts
│   ├── user-repository.ts
│   └── index.ts                     # Barrel re-export for ports
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
export const ApplicationErrorCodes = [
  'UNAUTHENTICATED',
  'ALREADY_SUBSCRIBED',
  'UNSUBSCRIBED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'STRIPE_ERROR',
  'INVALID_WEBHOOK_SIGNATURE',
  'INVALID_WEBHOOK_PAYLOAD',
  'INTERNAL_ERROR',
] as const;

export type ApplicationErrorCode = (typeof ApplicationErrorCodes)[number];

export class ApplicationError extends Error {
  readonly _tag = 'ApplicationError' as const;

  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    options?: { cause?: unknown },
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'ApplicationError';
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
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
  externalCustomerId: string; // opaque external id
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionOutput = { url: string };

export type PortalSessionInput = {
  externalCustomerId: string; // opaque external id
  returnUrl: string;
};

export type PortalSessionOutput = { url: string };

export type CreateCustomerInput = {
  userId: string; // internal UUID
  clerkUserId: string; // opaque external id
  email: string;
};

export type CreateCustomerOutput = { externalCustomerId: string };

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
    externalCustomerId: string; // opaque external id
    externalSubscriptionId: string; // opaque external id
    plan: SubscriptionPlan; // domain plan (monthly/annual)
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };
};

export type PaymentGatewayRequestOptions = {
  /**
   * Optional idempotency key provided by the client for this logical operation.
   *
   * Adapters may forward this to external providers (e.g., Stripe idempotency keys)
   * to make retries safe and avoid duplicate external side effects.
   */
  idempotencyKey?: string;
};

export interface PaymentGateway {
  createCustomer(
    input: CreateCustomerInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CreateCustomerOutput>;

  createCheckoutSession(
    input: CheckoutSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput>;

  createPortalSession(
    input: PortalSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<PortalSessionOutput>;

  /**
   * Verifies signature and normalizes the Stripe event for the use case/controller.
   */
  processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult>;
}

export type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  limit(input: RateLimitInput): Promise<RateLimitResult>;
  pruneExpiredWindows(before: Date, limit: number): Promise<number>;
}
```

---

## Repository Ports

**SSOT:** `src/application/ports/*.ts` (one port per module). `src/application/ports/repositories.ts` is a barrel re-export for convenience.

| Port | File | Notes |
|------|------|-------|
| `QuestionRepository` | `src/application/ports/question-repository.ts` | Published question reads + candidate ID listing |
| `AttemptRepository` | `src/application/ports/attempt-repository.ts` | **ISP composite** (writer + history + stats + missed-questions + most-recent timestamps) |
| `PracticeSessionRepository` | `src/application/ports/practice-session-repository.ts` | Session lifecycle + CAS-style state updates (record answer, mark for review) |
| `BookmarkRepository` | `src/application/ports/bookmark-repository.ts` | Exists/add/remove/list |
| `TagRepository` | `src/application/ports/tag-repository.ts` | `listAll()` |
| `SubscriptionRepository` | `src/application/ports/subscription-repository.ts` | Find/upsert subscription (domain projection) |
| `StripeCustomerRepository` | `src/application/ports/stripe-customer-repository.ts` | Stripe customer mapping |
| `StripeEventRepository` | `src/application/ports/stripe-event-repository.ts` | Webhook idempotency claim/lock/mark |
| `IdempotencyKeyRepository` | `src/application/ports/idempotency-key-repository.ts` | Application-level idempotency (ADR-015) |
| `UserRepository` | `src/application/ports/user-repository.ts` | Upsert/find/delete by Clerk ID |

### AttemptRepository (ISP composite)

`AttemptRepository` is intentionally split into small interfaces and then composed (Interface Segregation). Excerpt:

```ts
export interface AttemptWriter {
  insert(input: AttemptInsertInput): Promise<Attempt>;
  deleteById(id: string, userId: string): Promise<boolean>;
}

export interface AttemptStatsReader {
  countByUserId(userId: string): Promise<number>;
  // ...
}

export interface AttemptRepository
  extends AttemptWriter,
    AttemptHistoryReader,
    AttemptSessionReader,
    AttemptStatsReader,
    AttemptMissedQuestionsReader,
    AttemptMostRecentAnsweredAtReader {}
```

---

## Quality Gate

Ports are validated by:

- TypeScript compile (`pnpm typecheck`)
- Use case tests (SPEC-005) with fakes implementing these interfaces
