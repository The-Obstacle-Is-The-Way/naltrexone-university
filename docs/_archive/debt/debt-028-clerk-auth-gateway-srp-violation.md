# DEBT-028: ClerkAuthGateway Violates Single Responsibility Principle

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Description

`ClerkAuthGateway` mixes three distinct responsibilities:

1. **Authentication:** Extracting user identity from Clerk session
2. **Email Extraction:** Parsing email from Clerk user structure
3. **Persistence:** Upserting user row to database and mapping to domain entity

Per ADR-004 (Authentication Boundary), gateways should focus on auth concerns. Database persistence is a repository responsibility.

## Location

- `src/adapters/gateways/clerk-auth-gateway.ts`

## Current Implementation

```typescript
export class ClerkAuthGateway implements AuthGateway {
  async getCurrentUser(): Promise<User | null> {
    // 1. Get Clerk session (auth concern - correct)
    const clerkUser = await this.client.users?.getUser(userId);

    // 2. Extract email (mapping concern - borderline)
    const email = clerkUser.primaryEmailAddress?.emailAddress;

    // 3. Upsert to database (persistence concern - WRONG LAYER)
    const [row] = await this.db
      .insert(users)
      .values({ clerkId: userId, email, ... })
      .onConflictDoUpdate(...)
      .returning();

    // 4. Map to domain entity
    return { id: row.id, email: row.email, ... };
  }
}
```

## Impact

- **Testing:** Hard to test auth logic without database
- **Coupling:** Gateway knows about Drizzle schema and SQL operations
- **Reusability:** Can't reuse user upsert logic elsewhere
- **Clean Architecture:** Adapter (gateway) does repository work

## Resolution

Extract persistence to `UserRepository`:

```typescript
// src/application/ports/repositories.ts
export interface UserRepository {
  upsertByClerkId(clerkId: string, email: string): Promise<User>;
  findByClerkId(clerkId: string): Promise<User | null>;
}

// src/adapters/repositories/drizzle-user-repository.ts
export class DrizzleUserRepository implements UserRepository {
  async upsertByClerkId(clerkId: string, email: string): Promise<User> {
    const [row] = await this.db.insert(users)...
    return { id: row.id, email: row.email, ... };
  }
}

// src/adapters/gateways/clerk-auth-gateway.ts (refactored)
export class ClerkAuthGateway implements AuthGateway {
  constructor(
    private readonly clerkClient: ClerkClient,
    private readonly userRepository: UserRepository
  ) {}

  async getCurrentUser(): Promise<User | null> {
    const clerkUser = await this.clerkClient.users?.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
    return this.userRepository.upsertByClerkId(userId, email);
  }
}
```

## Acceptance Criteria

- [x] `UserRepository` interface added to ports
- [x] `DrizzleUserRepository` implements persistence logic
- [x] `ClerkAuthGateway` delegates to repository
- [x] Gateway no longer imports Drizzle/schema
- [x] All existing tests pass
- [x] New tests cover UserRepository

## Related

- ADR-004: Authentication Boundary
- ADR-007: Dependency Injection
- SOLID: Single Responsibility Principle
