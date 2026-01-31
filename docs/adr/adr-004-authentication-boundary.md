# ADR-004: Authentication Boundary

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

We need to authenticate users and protect routes. The challenge is:

1. Authentication is a **framework concern** (outermost layer)
2. Our **domain** should know nothing about Clerk, JWT, sessions, etc.
3. We want to be able to swap auth providers without rewriting business logic
4. We need to map external user identity to our internal User entity

## Decision

### The Boundary

Authentication lives in the **Frameworks & Drivers** layer. Our domain only knows about `User` entities with internal IDs.

```
┌──────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS (Clerk)                         │
│                                                               │
│   proxy.ts ──> clerkMiddleware() ──> Clerk session           │
│                                                               │
│   ┌──────────────────────────────────────────────────────┐   │
│   │              ADAPTERS (Auth Gateway)                  │   │
│   │                                                       │   │
│   │   ClerkAuthGateway implements AuthGateway            │   │
│   │   - getCurrentUser(): User | null                    │   │
│   │   - requireUser(): User (throws if not auth'd)       │   │
│   │                                                       │   │
│   │   ┌──────────────────────────────────────────────┐   │   │
│   │   │              USE CASES                        │   │   │
│   │   │                                               │   │   │
│   │   │   Input: userId (internal UUID)              │   │   │
│   │   │   No knowledge of Clerk, sessions, tokens    │   │   │
│   │   │                                               │   │   │
│   │   │   ┌──────────────────────────────────────┐   │   │   │
│   │   │   │           DOMAIN                      │   │   │   │
│   │   │   │                                       │   │   │   │
│   │   │   │   User entity with internal ID       │   │   │   │
│   │   │   │   No externalAuthId in domain logic  │   │   │   │
│   │   │   └──────────────────────────────────────┘   │   │   │
│   │   └──────────────────────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Auth Gateway Interface (Application Layer)

```typescript
// src/application/ports/gateways.ts

/**
 * Auth gateway interface.
 * Defined in application layer, implemented in adapters.
 * Use cases depend on this interface, not on Clerk directly.
 */
export interface AuthGateway {
  /**
   * Get the currently authenticated user.
   * Returns null if not authenticated.
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Get the currently authenticated user or throw.
   * Throws ApplicationError with code UNAUTHENTICATED if not logged in.
   */
  requireUser(): Promise<User>;

  /**
   * Ensure a user record exists in our database for the external auth user.
   * Creates the user if they don't exist.
   * Returns our internal User entity.
   */
  ensureUser(): Promise<User>;
}
```

### Clerk Auth Gateway Implementation (Adapters Layer)

```typescript
// src/adapters/gateways/clerk-auth-gateway.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { AuthGateway } from '@/application/ports/gateways';
import type { User } from '@/domain/entities';
import { ApplicationError } from '@/application/errors';

export class ClerkAuthGateway implements AuthGateway {
  async getCurrentUser(): Promise<User | null> {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return null;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return null;
    }

    return this.toDomain(user);
  }

  async requireUser(): Promise<User> {
    const user = await this.getCurrentUser();

    if (!user) {
      throw new ApplicationError('UNAUTHENTICATED', 'You must be signed in');
    }

    return user;
  }

  async ensureUser(): Promise<User> {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      throw new ApplicationError('UNAUTHENTICATED', 'You must be signed in');
    }

    // Check if user exists
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (user) {
      return this.toDomain(user);
    }

    // Create user - fetch email from Clerk
    const clerkUser = await currentUser();
    if (!clerkUser?.emailAddresses[0]?.emailAddress) {
      throw new ApplicationError('INTERNAL_ERROR', 'Could not retrieve user email');
    }

    [user] = await db
      .insert(users)
      .values({
        clerkUserId,
        email: clerkUser.emailAddresses[0].emailAddress,
      })
      .returning();

    return this.toDomain(user);
  }

  private toDomain(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      externalAuthId: row.clerkUserId,
      email: row.email,
      createdAt: row.createdAt,
    };
  }
}
```

### Route Protection (Frameworks Layer)

```typescript
// proxy.ts (Next.js middleware file)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### Use Case Usage

Use cases receive `userId` as input—they don't call the auth gateway themselves:

```typescript
// src/application/use-cases/submit-answer.ts
export type SubmitAnswerInput = {
  userId: string;        // Internal user ID, not Clerk ID
  questionId: string;
  choiceId: string;
};

export class SubmitAnswerUseCase {
  // ...
  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    // Use case knows nothing about Clerk, sessions, etc.
    // It just receives a userId that's already been validated
  }
}
```

### Controller Usage (Server Actions)

Controllers handle auth and call use cases:

```typescript
// src/adapters/controllers/question-controller.ts
'use server';

import { ClerkAuthGateway } from '../gateways/clerk-auth-gateway';
import { SubmitAnswerUseCase } from '@/application/use-cases/submit-answer';
import { DrizzleQuestionRepository, DrizzleAttemptRepository } from '../repositories';

const authGateway = new ClerkAuthGateway();

export async function submitAnswer(questionId: string, choiceId: string) {
  // Auth handled at controller level
  const user = await authGateway.requireUser();

  // Use case receives clean input
  const useCase = new SubmitAnswerUseCase(
    new DrizzleQuestionRepository(),
    new DrizzleAttemptRepository(),
  );

  return useCase.execute({
    userId: user.id,
    questionId,
    choiceId,
  });
}
```

### User ID Mapping

```
Clerk User ID (external)     Our User ID (internal)
────────────────────────     ─────────────────────
"user_2abc123..."        =>  "550e8400-e29b-41d4-..."

Stored in: users.clerk_user_id    users.id
```

The mapping happens **once** at the gateway boundary. Domain and use cases only see internal IDs.

## Consequences

### Positive

1. **Swappable Auth** — Replace Clerk with Auth0, Supabase Auth, or custom JWT without touching domain/use cases
2. **Testable** — Use cases can be tested with a `FakeAuthGateway`
3. **Clean Domain** — User entity has no auth-specific fields
4. **Single Mapping Point** — External ID mapping happens in one place

### Negative

1. **Extra Indirection** — Gateway adds a layer
2. **User Sync** — Must call `ensureUser()` to create DB record

### Mitigations

- Gateway is simple and rarely changes
- Use Clerk webhooks for user sync (optional optimization)

## Compliance Checklist

- [ ] No Clerk imports in `src/domain/`
- [ ] No Clerk imports in `src/application/`
- [ ] Use cases receive `userId`, not `clerkUserId`
- [ ] Domain User entity has internal ID as primary identity
- [ ] Auth gateway implements interface defined in application layer

## Testing

```typescript
// src/application/test-helpers/fakes.ts
export class FakeAuthGateway implements AuthGateway {
  private currentUser: User | null = null;

  setCurrentUser(user: User | null) {
    this.currentUser = user;
  }

  async getCurrentUser(): Promise<User | null> {
    return this.currentUser;
  }

  async requireUser(): Promise<User> {
    if (!this.currentUser) {
      throw new ApplicationError('UNAUTHENTICATED', 'Not logged in');
    }
    return this.currentUser;
  }

  async ensureUser(): Promise<User> {
    return this.requireUser();
  }
}
```

## References

- Clerk Next.js Documentation
- Clean Architecture, Chapter 22: The Clean Architecture
