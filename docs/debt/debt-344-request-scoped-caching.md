# DEBT-344: Request-Scoped Caching — Duplicate DB Hits and Static Content Re-Fetching

**Priority:** P2
**Created:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [ADR-010 Caching Strategy](../adr/adr-010-caching-strategy.md), [SPEC-016 Observability](../specs/spec-016-observability.md)

---

## Context

ADR-010 explicitly permits caching published question content and tag lists, but **no explicit caching has been implemented yet**. The codebase relies entirely on database speed for every read. Meanwhile, the most critical per-request operation — subscription/entitlement checking — executes **twice per page load** due to the layout + controller double-check pattern.

This is not a correctness bug. The app works correctly. But it does unnecessary database work on every single request.

---

## Finding 1: Duplicate Subscription Check (Every Request)

### The Problem

Every authenticated request hits `subscriptions.findByUserId()` **twice**:

1. **App layout** (`app/(app)/app/layout.tsx:47`) — `enforceEntitledAppUser()` calls `checkEntitlementUseCase.execute()`
2. **Controller helper** (`src/adapters/controllers/require-entitled-user-id.ts:14`) — each server action calls `requireEntitledUserId()` which calls `checkEntitlementUseCase.execute()` again

Both calls execute the same query: `SELECT ... FROM subscriptions WHERE user_id = $1`.

### Impact

- 2x subscription queries per page load (layout render + first server action)
- On pages with multiple server actions (dashboard calls `getUserStats` + `getSessionHistory` in parallel), this becomes 3x
- The subscription table is small, so individual queries are fast (~2-5ms), but the cumulative effect across all requests adds up

### Proposed Fix

Wrap `checkEntitlementUseCase.execute()` with `React.cache()` at the controller/framework layer:

```typescript
// lib/cached.ts (framework layer — allowed by ADR-010)
import { cache } from 'react';

export function createCachedEntitlementCheck(
  useCase: CheckEntitlementUseCase
) {
  return cache((userId: string) => useCase.execute({ userId }));
}
```

This deduplicates within a single React server render pass. No TTL needed — `React.cache` is request-scoped by default.

**ADR-010 compliance:** Subscription status is not cached *across* requests (which ADR-010 prohibits). It's only deduplicated *within* a single request lifecycle.

---

## Finding 2: Static Question Content Fetched Fresh Every Time

### The Problem

Published question content (text, choices, explanations, tags) is **immutable between seed runs**. Once seeded, questions don't change until the next deployment. Yet every `getNextQuestion`, `getQuestionView`, and `getUserStats` call hits the database for question data.

### Impact

- Question reads are the most common DB operation (every practice interaction)
- Question content is ~1-3KB per question; the full bank is ~500 questions
- Database queries are fast but add latency vs. in-memory reads

### Proposed Fix (Two Tiers)

**Tier 1 — `React.cache` for per-request dedup (easy, safe):**

```typescript
// Wrap question repository reads at framework layer
export const getCachedQuestion = cache(
  (id: string) => questionRepo.findPublishedById(id)
);
```

Eliminates duplicate question fetches within a single render (e.g., `getNextQuestion` + enrichment helpers reading the same question).

**Tier 2 — `unstable_cache` with `revalidateTag` for cross-request caching (bigger win, more complexity):**

```typescript
import { unstable_cache } from 'next/cache';

const getCachedQuestions = unstable_cache(
  async (ids: string[]) => questionRepo.findPublishedByIds(ids),
  ['questions'],
  { tags: ['questions'], revalidate: 3600 } // 1 hour, or on-demand via tag
);
```

Invalidation: call `revalidateTag('questions')` in the seed script's server action (not from the CLI script itself — per ADR-010).

### Redis?

**Not needed at this stage.** `React.cache` (request-scoped) and `unstable_cache` (cross-request, file-system or Vercel KV backed) cover the immediate needs without adding infrastructure. Redis becomes worth considering if/when:

- Multiple Vercel regions need shared cache
- Cache hit rates need monitoring
- Sub-millisecond cache reads become important

For a single-region Vercel deployment with ~500 questions, framework caching is sufficient.

---

## Finding 3: Container Creates Fresh Repository Instances Per Request

### The Problem

`createContainer()` in `lib/container.ts` instantiates all repositories fresh on every request. Repositories are stateless (no instance-level cache), so there's no reuse benefit. This isn't a performance problem per se — object creation is cheap — but it means there's no natural place to attach request-scoped caching.

### Proposed Fix

Not a standalone fix. When implementing Tier 1 caching above, the cached wrappers should live at the framework layer (`lib/cached.ts` or similar), not inside the repositories themselves (which are in the adapters layer and shouldn't know about React).

---

## Implementation Order

1. **`React.cache` for entitlement check** — Smallest change, biggest per-request win. Eliminates the double subscription query.
2. **`React.cache` for question reads** — Eliminates duplicate question fetches within a render.
3. **`unstable_cache` for question content** — Cross-request caching for static content. Requires invalidation wiring.

## Scope

- Framework layer only (per ADR-010)
- No domain or application layer changes
- No infrastructure additions (no Redis)
- No changes to the subscription freshness guarantee

## Estimated Effort

- Tier 1 (React.cache for entitlement + questions): ~2-3 hours
- Tier 2 (unstable_cache for questions): ~4-6 hours including invalidation wiring and testing
