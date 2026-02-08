# DEBT-172: Duplicate Zod Schema Definitions Across Controllers

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Several Zod schema primitives are defined identically in multiple controller files instead of being shared from a single source:

### `zUuid` — defined 3 times

```typescript
const zUuid = z.string().uuid();
```

| File | Line |
|------|------|
| `src/adapters/controllers/bookmark-controller.ts` | 26 |
| `src/adapters/controllers/practice-controller.ts` | 38 |
| `src/adapters/controllers/question-controller.ts` | 32 |

### `zDifficulty` — defined 2 times

```typescript
const zDifficulty = z.enum(['easy', 'medium', 'hard']);
```

| File | Line |
|------|------|
| `src/adapters/controllers/practice-controller.ts` | 40 |
| `src/adapters/controllers/question-controller.ts` | 34 |

## Impact

- **DRY violation** — identical definitions copied across files
- **Drift risk** — if the difficulty enum gains a new value (e.g., `'expert'`), it must be updated in multiple places
- **Inconsistency risk** — one file could add validation constraints (e.g., `.min(1)`) that others don't have
- **Minor** — these are small constant definitions, so the impact is limited. This is a code hygiene issue, not a correctness issue.

## Resolution

Extract shared Zod schema primitives to a single file:

**Create:** `src/adapters/shared/zod-schemas.ts`

```typescript
import { z } from 'zod';

export const zUuid = z.string().uuid();
export const zDifficulty = z.enum(['easy', 'medium', 'hard']);
```

Update all three controller files to import from the shared module.

## Verification

- [x] Shared schema module created (`src/adapters/shared/zod-schemas.ts`)
- [x] Bookmark, practice, and question controllers import shared `zUuid`/`zDifficulty`
- [x] Duplicate local definitions removed from all targeted controllers
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `src/adapters/controllers/bookmark-controller.ts`
- `src/adapters/controllers/practice-controller.ts`
- `src/adapters/controllers/question-controller.ts`
- `src/adapters/shared/` — existing shared adapter types directory
