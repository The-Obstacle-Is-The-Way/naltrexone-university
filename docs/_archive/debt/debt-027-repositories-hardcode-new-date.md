# DEBT-027: Repositories Hardcode `new Date()` Instead of Injecting Time Dependency

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

Multiple repository implementations directly call `new Date()` instead of injecting a time dependency. This violates Dependency Inversion Principle and makes time-sensitive logic difficult to test deterministically.

Notably, `ClerkAuthGateway` correctly implements this pattern with an optional `now: () => Date` parameter, but repositories don't follow suit.

## Locations

- `src/adapters/repositories/drizzle-practice-session-repository.ts:103` - `end()` uses `new Date()` for `endedAt`
- `src/adapters/repositories/drizzle-stripe-event-repository.ts:45` - `markProcessed()` uses `new Date()` for `processedAt`
- `src/adapters/repositories/drizzle-subscription-repository.ts:92,102` - `upsert()` uses `new Date()` for timestamps

## Impact

- **Testing:** Cannot test time-dependent behavior deterministically
- **Consistency:** Inconsistent pattern across adapters layer
- **Time Bugs:** Hard to simulate edge cases like timezone issues or time-based logic

## Current Pattern (ClerkAuthGateway)

```typescript
export class ClerkAuthGateway implements AuthGateway {
  constructor(
    private readonly db: Db,
    private readonly client: ClerkClient,
    private readonly now: () => Date = () => new Date()
  ) {}
}
```

## Resolution

Apply same pattern to all repositories that use timestamps:

```typescript
export class DrizzlePracticeSessionRepository implements PracticeSessionRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date()
  ) {}

  async end(sessionId: string): Promise<PracticeSession> {
    const result = await this.db
      .update(practiceSessions)
      .set({ endedAt: this.now() })  // Use injected time
      // ...
  }
}
```

## Files to Update

1. `drizzle-practice-session-repository.ts`
2. `drizzle-stripe-event-repository.ts`
3. `drizzle-subscription-repository.ts`

Update `lib/container.ts` to wire the `now` dependency when creating repositories.

## Acceptance Criteria

- [ ] All 3 repositories accept optional `now: () => Date` parameter
- [ ] Tests use injected time for deterministic assertions
- [ ] Container wires default `() => new Date()` in production
- [ ] No direct `new Date()` calls remain in repository methods

## Related

- ADR-007: Dependency Injection
- Clean Architecture: Dependency Inversion Principle
