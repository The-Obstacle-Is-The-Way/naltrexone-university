# DEBT-032: Incomplete Composition Root (Missing Use Case Factories)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Description

The composition root in `lib/container.ts` only wires gateways. Repositories and use cases must be manually instantiated at call sites, leading to scattered dependency wiring throughout the codebase.

## Location

- `lib/container.ts`

## Current State

```typescript
// container.ts - only gateways wired
export function createAuthGateway(): AuthGateway { ... }
export function createPaymentGateway(): PaymentGateway { ... }

// Call sites must manually wire everything else
// app/api/stripe/webhook/route.ts
const eventRepo = new DrizzleStripeEventRepository(db);
const customerRepo = new DrizzleStripeCustomerRepository(db);
const subscriptionRepo = new DrizzleSubscriptionRepository(db);
const controller = new StripeWebhookController(...);
```

## Impact

- **Duplication:** Same wiring repeated across multiple entry points
- **Coupling:** Call sites know about concrete implementations
- **Testing:** Harder to swap implementations
- **Maintainability:** Adding new dependencies requires updating all call sites

## Resolution

Expanded the container with factory functions for repositories, use cases,
and controller deps. Call sites now use container factories (for example,
Stripe webhook handler uses `createStripeWebhookDeps()`).

```typescript
// lib/container.ts

// Repositories
export function createAttemptRepository(): AttemptRepository {
  return new DrizzleAttemptRepository(db);
}

export function createQuestionRepository(): QuestionRepository {
  return new DrizzleQuestionRepository(db);
}

export function createSubscriptionRepository(): SubscriptionRepository {
  return new DrizzleSubscriptionRepository(db);
}

// Use Cases
export function createCheckEntitlementUseCase(): CheckEntitlementUseCase {
  return new CheckEntitlementUseCase(createSubscriptionRepository());
}

export function createSubmitAnswerUseCase(): SubmitAnswerUseCase {
  return new SubmitAnswerUseCase(
    createAttemptRepository(),
    createQuestionRepository()
  );
}

// Controllers (deps)
export function createStripeWebhookDeps(): StripeWebhookDeps {
  return {
    paymentGateway: createPaymentGateway(),
    transaction: async (fn) =>
      db.transaction(async (tx) =>
        fn({
          stripeEvents: createStripeEventRepository(tx),
          stripeCustomers: createStripeCustomerRepository(tx),
          subscriptions: createSubscriptionRepository(tx),
        }),
      ),
  };
}
```

## Acceptance Criteria

- [x] Factory functions exist for all repositories
- [x] Factory functions exist for all use cases
- [x] Factory functions exist for controllers (controller deps factory)
- [x] Call sites use factories instead of direct instantiation
- [x] Tests can override factories for mocking

## Related

- ADR-007: Dependency Injection
- ADR-012: Directory Structure
- Clean Architecture: Composition Root pattern
