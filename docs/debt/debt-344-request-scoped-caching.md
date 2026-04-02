# DEBT-344: Request-Scoped Auth/Entitlement Dedup + Static Read Caching

**Priority:** P2
**Created:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [ADR-010 Caching Strategy](../adr/adr-010-caching-strategy.md), [SPEC-016 Observability](../specs/spec-016-observability.md)

---

## Context

ADR-010 permits framework-layer caching for published question content and tag lists, while forbidding stale subscription/entitlement data across requests. The repo currently has **no explicit `cache`, `use cache`, `unstable_cache`, `cacheTag`, or `updateTag` usage checked in**.

The biggest confirmed waste today is not "every request always hits subscriptions twice" in the abstract. It is **repeated auth + entitlement work inside the same server render**, plus repeated cross-request reads of immutable question/tag data.

---

## Finding 1: Repeated Auth + Entitlement Work Within One Render

### The Problem

Several hot paths independently do:

- `authGateway.getCurrentUser()` or `authGateway.requireUser()`
- `checkEntitlementUseCase.execute({ userId })`

Confirmed duplicate paths today:

| Surface | Duplicate calls in same render |
|---------|-------------------------------|
| App shell | [`app/(app)/app/layout.tsx`](../../app/(app)/app/layout.tsx) `enforceEntitledAppUser()` + [`components/auth-nav.tsx`](../../components/auth-nav.tsx) `AuthNav()` |
| Dashboard | App shell duplicates above, plus [`src/adapters/controllers/stats-controller.ts`](../../src/adapters/controllers/stats-controller.ts) `getUserStats()` and [`src/adapters/controllers/practice-controller.ts`](../../src/adapters/controllers/practice-controller.ts) `getSessionHistory()` both call [`requireEntitledUserId`](../../src/adapters/controllers/require-entitled-user-id.ts) during the initial render |
| Home page (signed-in user) | [`components/auth-nav.tsx`](../../components/auth-nav.tsx) `AuthNav()` + [`components/get-started-cta.tsx`](../../components/get-started-cta.tsx) `GetStartedCta()` |
| Pricing page (signed-in user) | [`app/pricing/page.tsx`](../../app/pricing/page.tsx) `loadPricingData()` + [`components/auth-nav.tsx`](../../components/auth-nav.tsx) `AuthNav()` |

### Impact

- Signed-in requests can repeat the same entitlement query 2-4 times before any user interaction
- Duplicate Clerk user resolution is happening alongside the duplicate subscription lookup
- This is especially wasteful on shared chrome (`AuthNav`, CTA, pricing gate) because the code paths are logically asking the same question

### Proposed Fix

Introduce shared request-scoped helpers at the framework layer and have layout/components/controllers reuse them:

```typescript
// lib/auth-request-cache.ts (framework layer)
import { cache } from 'react';

export const getRequestAuthState = cache(async () => {
  const { createContainer } = await import('@/lib/container');
  const container = createContainer();
  const authGateway = container.createAuthGateway();
  const checkEntitlementUseCase = container.createCheckEntitlementUseCase();

  const user = await authGateway.getCurrentUser();
  if (!user) return { user: null, entitlement: null };

  const entitlement = await checkEntitlementUseCase.execute({
    userId: user.id,
  });

  return { user, entitlement };
});
```

Use the same cached helper from app layout, `AuthNav`, `GetStartedCta`, pricing-page loaders, and controller helpers that run during server rendering.

Important: the cached helper must own dependency resolution internally or close over a stable request-local dependency object. Passing fresh gateway/use-case instances as cache arguments would defeat memoization because `createContainer()` currently returns new object identities.

**ADR-010 compliance:** this deduplicates only inside the current render/request. Separate POST server-action requests still re-check entitlement fresh, which preserves webhook-driven subscription updates.

---

## Finding 2: Published Question + Tag Reads Are Still Uncached Across Requests

### The Problem

Published question content and tag lists are effectively immutable between content updates, but the repository still fetches them fresh on every request:

- [`src/adapters/repositories/drizzle-question-repository.ts`](../../src/adapters/repositories/drizzle-question-repository.ts) reads via `findPublishedById`, `findPublishedBySlug`, and `findPublishedByIds`
- [`src/adapters/controllers/tag-controller.ts`](../../src/adapters/controllers/tag-controller.ts) always calls `tagRepository.listAll()`

Important correction: this is **not** a blanket N+1 problem in every path. [`src/application/use-cases/get-user-stats.ts`](../../src/application/use-cases/get-user-stats.ts) already batches recent-activity question reads through [`src/application/shared/fetch-questions-by-id.ts`](../../src/application/shared/fetch-questions-by-id.ts), which de-duplicates IDs before calling `findPublishedByIds(...)`.

The real gap is:

- repeated cross-request reads of immutable question/tag data
- occasional same-request re-reads where multiple helpers ask for the same published question or tag list

### Proposed Fix (Two Tiers)

**Tier 1: `cache` for request-scoped dedup (easy, safe)**

```typescript
export const getCachedPublishedQuestionById = cache(
  async (id: string) => {
    const { createContainer } = await import('@/lib/container');
    return createContainer().createQuestionRepository().findPublishedById(id);
  },
);
```

This helps when one render path reuses the same published question or tag list multiple times.

**Tier 2: Next cross-request caching for published questions/tags only**

If read volume justifies it, add framework-level caching for:

- published question payloads
- tag lists

Use current Next.js runtime primitives (`use cache` / `unstable_cache`) only for those immutable reads. Do **not** cross-request cache subscription state, attempts, or stats.

### Redis?

**Not needed now.** Request-scoped dedup plus framework-managed caching covers the immediate wins without extra infra. Redis becomes worth reconsidering only when:

- Multiple Vercel regions need shared cache
- Cache hit rates need monitoring
- Sub-millisecond cache reads become important

For a single-region Vercel deployment with a ~500-question bank, that is a later-stage concern, not an immediate requirement.

## Implementation Order

1. Shared request-scoped auth/entitlement helper reused by layout, marketing chrome, and server-render controllers
2. Request-scoped dedup for published question/tag reads where repeated within one render
3. Cross-request caching for published questions/tags only if the remaining query volume justifies the added invalidation work

## Scope

- Framework layer only
- No domain or application layer changes
- No Redis
- No relaxation of subscription freshness guarantees

## Estimated Effort

~2-6 hours depending on whether the work stops at request-scoped dedup or also introduces cross-request caching for published questions/tags.
