---
paths:
  - "src/domain/**"
---

# Domain Layer Rules

This is the innermost layer. It must be 100% pure.

## ZERO external imports

- No framework code (Next.js, React, Drizzle, Clerk, Stripe)
- No infrastructure (database, HTTP, file system)
- No application layer imports
- Only: TypeScript built-ins, other domain modules

## What belongs here

- **Entities:** `User`, `Subscription`, `Question`, `PracticeSession`
- **Value objects:** `SubscriptionPlan`, `QuestionDifficulty`, `GradingResult`
- **Domain services:** Pure functions operating on entities
- **Domain errors:** Typed error classes for domain-level failures
- **Test helpers:** `createQuestion()`, `createChoice()` factories in `test-helpers/`

## What does NOT belong here

- Database queries or ORM calls
- API calls or HTTP concerns
- UI components or React code
- Vendor-specific identifiers (Clerk IDs, Stripe IDs)

## Testing

- Colocated tests: `*.test.ts` next to source
- Must be testable with ZERO infrastructure
- Use domain test factories, not raw object literals
