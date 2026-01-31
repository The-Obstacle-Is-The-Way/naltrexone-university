# SPEC-008: Auth Gateway (Clerk)

**Status:** Ready
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports), SPEC-007 (Repositories)
**Implements:** ADR-001, ADR-004

---

## Objective

Implement the `AuthGateway` interface using Clerk. This adapter bridges the Application layer's authentication abstraction to the concrete Clerk SDK.

---

## Files to Create

```
src/adapters/gateways/
├── clerk-auth-gateway.ts
├── clerk-auth-gateway.test.ts
└── index.ts
```

---

## Design Pattern: Adapter + Facade

```
┌─────────────────────────────────────────────────┐
│         APPLICATION LAYER (ports)               │
│                                                 │
│   AuthGateway (interface)                       │
│   - getCurrentUser(): Promise<User | null>      │
│   - requireUser(): Promise<User>                │
│   - getClerkUserId(): Promise<string | null>    │
│                                                 │
└─────────────────────────────────────────────────┘
                    ▲
                    │ implements
                    │
┌─────────────────────────────────────────────────┐
│         ADAPTERS LAYER                          │
│                                                 │
│   ClerkAuthGateway                              │
│   - wraps @clerk/nextjs auth() function         │
│   - syncs Clerk user to local users table       │
│   - throws ApplicationError on auth failure     │
│                                                 │
└─────────────────────────────────────────────────┘
                    │
                    │ uses
                    ▼
┌─────────────────────────────────────────────────┐
│         EXTERNAL SERVICES                       │
│                                                 │
│   @clerk/nextjs                                 │
│   - auth() for session info                     │
│   - currentUser() for user details              │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Test Strategy

AuthGateway tests use a **Fake** Clerk client (per ADR-003). We don't mock Clerk SDK directly - instead we inject the authentication context.

---

## Test First

### File: `src/adapters/gateways/clerk-auth-gateway.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ClerkAuthGateway } from './clerk-auth-gateway';
import { FakeUserRepository } from '@/test/helpers/fakes';
import { ApplicationError } from '@/src/application/errors/application-errors';

// Fake auth context for testing
type FakeAuthContext = {
  userId: string | null;
  email: string | null;
};

describe('ClerkAuthGateway', () => {
  let userRepo: FakeUserRepository;
  let authContext: FakeAuthContext;
  let gateway: ClerkAuthGateway;

  beforeEach(() => {
    userRepo = new FakeUserRepository();
    authContext = { userId: null, email: null };

    // Gateway with injectable auth context for testing
    gateway = new ClerkAuthGateway(userRepo, () => authContext);
  });

  describe('getClerkUserId', () => {
    it('returns null when not authenticated', async () => {
      authContext.userId = null;

      const result = await gateway.getClerkUserId();

      expect(result).toBeNull();
    });

    it('returns clerk user ID when authenticated', async () => {
      authContext.userId = 'clerk_abc123';

      const result = await gateway.getClerkUserId();

      expect(result).toBe('clerk_abc123');
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when not authenticated', async () => {
      authContext.userId = null;

      const result = await gateway.getCurrentUser();

      expect(result).toBeNull();
    });

    it('creates user on first authentication', async () => {
      authContext.userId = 'clerk_abc123';
      authContext.email = 'test@example.com';

      const user = await gateway.getCurrentUser();

      expect(user).not.toBeNull();
      expect(user?.clerkUserId).toBe('clerk_abc123');
      expect(user?.email).toBe('test@example.com');
    });

    it('returns existing user on subsequent calls', async () => {
      authContext.userId = 'clerk_abc123';
      authContext.email = 'test@example.com';

      const first = await gateway.getCurrentUser();
      const second = await gateway.getCurrentUser();

      expect(first?.id).toBe(second?.id);
    });
  });

  describe('requireUser', () => {
    it('throws UNAUTHENTICATED when not logged in', async () => {
      authContext.userId = null;

      await expect(gateway.requireUser()).rejects.toThrow(ApplicationError);
      await expect(gateway.requireUser()).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('returns user when authenticated', async () => {
      authContext.userId = 'clerk_abc123';
      authContext.email = 'test@example.com';

      const user = await gateway.requireUser();

      expect(user.clerkUserId).toBe('clerk_abc123');
    });
  });
});
```

---

## Implementation

### File: `src/adapters/gateways/clerk-auth-gateway.ts`

```typescript
import { auth, currentUser } from '@clerk/nextjs/server';
import type { AuthGateway } from '@/src/application/ports';
import type { UserRepository } from '@/src/application/ports';
import type { User } from '@/src/domain/entities';
import { Errors } from '@/src/application/errors/application-errors';

/**
 * Auth context provider type (for testability)
 */
type AuthContextProvider = () => {
  userId: string | null;
  email: string | null;
} | Promise<{
  userId: string | null;
  email: string | null;
}>;

/**
 * Clerk implementation of AuthGateway
 * Syncs Clerk users to local database on first access
 */
export class ClerkAuthGateway implements AuthGateway {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly getAuthContext?: AuthContextProvider
  ) {}

  /**
   * Get Clerk user ID from session
   */
  async getClerkUserId(): Promise<string | null> {
    if (this.getAuthContext) {
      const ctx = await this.getAuthContext();
      return ctx.userId;
    }

    const { userId } = await auth();
    return userId;
  }

  /**
   * Get current user, syncing to local DB if needed
   */
  async getCurrentUser(): Promise<User | null> {
    const clerkUserId = await this.getClerkUserId();
    if (!clerkUserId) return null;

    // Check if already in local DB
    const existing = await this.userRepo.findByClerkId(clerkUserId);
    if (existing) return existing;

    // Get email from Clerk and sync to local DB
    const email = await this.getEmail();
    if (!email) return null;

    return this.userRepo.upsertByClerkId(clerkUserId, email);
  }

  /**
   * Get current user or throw UNAUTHENTICATED
   */
  async requireUser(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw Errors.unauthenticated();
    }
    return user;
  }

  /**
   * Get email from auth context
   */
  private async getEmail(): Promise<string | null> {
    if (this.getAuthContext) {
      const ctx = await this.getAuthContext();
      return ctx.email;
    }

    const user = await currentUser();
    return user?.emailAddresses[0]?.emailAddress ?? null;
  }
}

/**
 * Factory function for production use
 */
export function createClerkAuthGateway(userRepo: UserRepository): ClerkAuthGateway {
  return new ClerkAuthGateway(userRepo);
}
```

### File: `src/adapters/gateways/index.ts`

```typescript
export { ClerkAuthGateway, createClerkAuthGateway } from './clerk-auth-gateway';
export { StripePaymentGateway, createStripePaymentGateway } from './stripe-payment-gateway';
```

---

## Integration with Next.js

### Usage in Server Actions

```typescript
// app/actions/example.ts
'use server';

import { createClerkAuthGateway } from '@/src/adapters/gateways';
import { DrizzleUserRepository } from '@/src/adapters/repositories';
import { db } from '@/lib/db';

export async function protectedAction() {
  const userRepo = new DrizzleUserRepository(db);
  const authGateway = createClerkAuthGateway(userRepo);

  // Will throw ApplicationError if not authenticated
  const user = await authGateway.requireUser();

  // Continue with authenticated user...
}
```

---

## Quality Gate

```bash
pnpm test src/adapters/gateways/clerk-auth-gateway.test.ts
```

---

## Definition of Done

- [ ] ClerkAuthGateway implements AuthGateway interface
- [ ] Syncs Clerk user to local users table
- [ ] Throws ApplicationError for authentication failures
- [ ] Testable with injectable auth context
- [ ] All tests pass without real Clerk calls
- [ ] Factory function for production use
