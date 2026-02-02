# SPEC-010: Server Actions (Controllers)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports), SPEC-005 (Use Cases)
**Implements:** ADR-001 (Clean Architecture), ADR-006 (Errors), ADR-011 (API Principles), ADR-012 (Directory Structure)

---

## Objective

Define the rules for Next.js Server Actions that act as **Controllers** in Clean Architecture.

Controllers are responsible for:

- Input validation (Zod) at the boundary
- Composing dependencies via `lib/container.ts` (composition root)
- Calling use cases (preferred) or thin orchestration with ports
- Returning `ActionResult<T>` (never leak stacks to clients)

---

## Location (Required)

Per ADR-012 and the Next.js 16 “Proxy” file convention:

- Server Actions live in `src/adapters/controllers/`
- Request-layer middleware lives in `proxy.ts`

---

## Files to Create

```text
src/adapters/controllers/
├── action-result.ts
├── billing-controller.ts
├── question-controller.ts
├── practice-controller.ts
├── review-controller.ts
├── bookmark-controller.ts
├── stats-controller.ts
├── stripe-webhook-controller.ts
└── index.ts
```

---

## Composition Root Contract (Required)

**File:** `lib/container.ts`

This is the **only** place where concrete implementations are wired to application ports.

**Rules:**

- Export factory functions that create controller dependencies (ports → implementations).
- Factories return **new** repositories/gateways/use cases (no singletons) on each call.
- The only allowed singleton is the DB client in `lib/db.ts` (and Stripe SDK init in `lib/stripe.ts`).
- Factories contain no request-specific logic (no `cookies()`, `headers()`, etc).
- Controllers call factories when `deps` are not provided; tests pass `deps` explicitly.

**Factory surface (minimum, grows by slice):**

- SLICE-1: `createBillingControllerDeps()`
- PAYWALL: `createStripeWebhookDeps()`
- SLICE-2: `createQuestionControllerDeps()`, `createBookmarkControllerDeps()`
- SLICE-3: `createPracticeControllerDeps()`
- SLICE-4: `createReviewControllerDeps()`, `createBookmarkControllerDeps()`
- SLICE-5: `createStatsControllerDeps()`

**Controller signature pattern (required):**

```ts
import { createContainer } from '@/lib/container';
import type { ActionResult } from './action-result';

type Container = ReturnType<typeof createContainer>;
type QuestionControllerDeps = ReturnType<Container['createQuestionControllerDeps']>;

export async function getNextQuestion(
  input: unknown,
  deps?: QuestionControllerDeps,
): Promise<ActionResult<unknown>> {
  const d = deps ?? createContainer().createQuestionControllerDeps();
  // ...
}
```

---

## Standard Return Type (Required)

**File:** `src/adapters/controllers/action-result.ts`

This matches `docs/specs/master_spec.md` Section 4.3.

```ts
export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STRIPE_ERROR'
  | 'INTERNAL_ERROR';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } };
}

export function handleError(error: unknown): ActionResult<never> {
  // Controllers should call this in their catch blocks to avoid leaking stacks.
  return err('INTERNAL_ERROR', 'Internal error');
}
```

---

## Controller Pattern (Required)

Every controller function:

1. Accepts `unknown` input (or defaults) and validates with Zod `.safeParse()`
2. Calls `AuthGateway.requireUser()` for authenticated routes
3. Calls entitlement check for subscribed routes
4. Calls a use case (preferred) or orchestrates via ports + domain services
5. Returns `ActionResult<T>`

Controllers SHOULD NOT:

- Perform complex business decisions (belongs in domain/use cases)
- Contain raw SQL or large query/mapping blocks (belongs in repositories)

---

## Stripe Webhook Controller (Route Handler)

**File:** `src/adapters/controllers/stripe-webhook-controller.ts`

Stripe webhooks are **not** Server Actions, but they still live in the controller layer because they:

- Verify request authenticity (signature verification via `PaymentGateway`)
- Define a transaction boundary for idempotency + subscription updates
- Coordinate repositories/gateways without leaking infrastructure details upward

**Invocation (Route Handler):**

- `app/api/stripe/webhook/route.ts` calls `processStripeWebhook(...)` via `createWebhookHandler(...)`.
- `lib/container.ts` wires `createStripeWebhookDeps()` (including a transaction wrapper).

**Responsibilities (high level):**

- Parse and verify Stripe webhook event (delegate to `PaymentGateway`)
- Claim/lock event for idempotency (`StripeEventRepository`)
- Upsert subscription state (`SubscriptionRepository`) and stripe customer mapping (`StripeCustomerRepository`)
- Mark events processed/failed with useful error context

---

## Testing

Controller tests are **unit tests**:

- Inject fakes for all ports
- No real DB
- No real Clerk or Stripe

Integration tests live under `tests/integration/` and validate the real stack (schema + repositories + controllers).
