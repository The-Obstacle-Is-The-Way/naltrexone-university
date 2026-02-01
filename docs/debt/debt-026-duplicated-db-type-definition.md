# DEBT-026: Duplicated Db Type Definition Across All Repositories

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

Every Drizzle repository and gateway re-declares the same `Db` type locally:

```typescript
type Db = PostgresJsDatabase<typeof schema>;
```

This violates DRY (Don't Repeat Yourself) and creates maintenance burden when the type needs to change.

## Locations

Found in 9 files:
- `src/adapters/repositories/drizzle-attempt-repository.ts:8`
- `src/adapters/repositories/drizzle-bookmark-repository.ts:7`
- `src/adapters/repositories/drizzle-practice-session-repository.ts:17`
- `src/adapters/repositories/drizzle-question-repository.ts:13`
- `src/adapters/repositories/drizzle-stripe-customer-repository.ts:10`
- `src/adapters/repositories/drizzle-stripe-event-repository.ts:8`
- `src/adapters/repositories/drizzle-subscription-repository.ts:12`
- `src/adapters/repositories/drizzle-tag-repository.ts:7`
- `src/adapters/gateways/clerk-auth-gateway.ts:10`

## Impact

- **Maintenance:** If we change database schema import structure, 9 files need updating
- **Inconsistency Risk:** Easy to accidentally create slightly different type definitions
- **Cognitive Load:** New developers must understand why this type is repeated

## Resolution

1. Create shared type module:

```typescript
// src/adapters/shared/database-types.ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

export type DrizzleDb = PostgresJsDatabase<typeof schema>;
```

2. Update all repositories and gateways:

```typescript
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DrizzleDb) {}
  // ...
}
```

## Acceptance Criteria

- [ ] `src/adapters/shared/database-types.ts` exists with `DrizzleDb` export
- [ ] All 9 files import from shared module
- [ ] No local `type Db = ...` declarations remain
- [ ] All tests pass after refactor

## Related

- ADR-012: Directory Structure
- ADR-007: Dependency Injection
