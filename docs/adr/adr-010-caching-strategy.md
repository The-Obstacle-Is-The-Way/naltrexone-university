# ADR-010: Caching Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

Performance is critical for a good user experience. We need a caching strategy that:

1. Reduces **database load** — Avoid redundant queries
2. Improves **response times** — Fast page loads and interactions
3. Works with **Next.js 16** — Leverages Cache Components and PPR
4. Maintains **data freshness** — Users see current data
5. Is **simple** — No premature optimization

**Next.js 16 Context:**
Next.js 16 introduced Cache Components with explicit opt-in caching via `use cache` directive. This replaces the implicit caching of earlier versions.

**Reference:**
- [Next.js 16 Blog - Cache Components](https://nextjs.org/blog/next-16)
- [Next.js 16 App Router Patterns](https://medium.com/@beenakumawat002/next-js-app-router-advanced-patterns-for-2026-server-actions-ppr-streaming-edge-first-b76b1b3dcac7)

## Decision

We adopt a **layered caching strategy** with explicit opt-in at each level.

### Caching Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BROWSER CACHE                                       │
│                                                                          │
│   Static assets (CSS, JS, images) - immutable, long-lived               │
│   Managed by Next.js automatically via content hashing                  │
└─────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      CDN / EDGE CACHE (Vercel)                          │
│                                                                          │
│   Static pages (/, /pricing) - ISR with revalidation                   │
│   API responses (where appropriate) - Cache-Control headers            │
└─────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SERVER CACHE (Next.js)                              │
│                                                                          │
│   Cache Components with `use cache` directive                           │
│   Request memoization via React cache()                                 │
│   Data Cache via unstable_cache (legacy)                                │
└─────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      DATABASE                                            │
│                                                                          │
│   Neon Postgres (connection pooling included)                           │
│   Query optimization via indexes                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### What to Cache

| Data Type | Cache Strategy | TTL | Invalidation |
|-----------|---------------|-----|--------------|
| Questions (published) | Cache Component | 1 hour | On seed script run |
| Tags list | Cache Component | 1 hour | On seed script run |
| User subscription | Request memoization | Per request | Webhook updates DB |
| User stats | No cache | N/A | Real-time |
| Practice session | No cache | N/A | Real-time |
| Attempts | No cache | N/A | Real-time |

### Cache Components (Next.js 16)

For stable, read-heavy data like questions:

```typescript
// app/(app)/app/practice/page.tsx
import { getPublishedQuestionCount, getTags } from '@/lib/data/questions';

// This component's data fetching will be cached
export default async function PracticePage() {
  // These functions use `use cache` internally
  const [questionCount, tags] = await Promise.all([
    getPublishedQuestionCount(),
    getTags(),
  ]);

  return (
    <PracticeSetup questionCount={questionCount} tags={tags} />
  );
}
```

```typescript
// lib/data/questions.ts
'use cache';

import { db } from '@/lib/db';
import { questions, tags } from '@/db/schema';
import { eq, count } from 'drizzle-orm';

export async function getPublishedQuestionCount(): Promise<number> {
  'use cache';
  // Cache tag for invalidation
  cacheTag('questions');
  cacheLife('hours', 1);

  const [result] = await db
    .select({ count: count() })
    .from(questions)
    .where(eq(questions.status, 'published'));

  return result.count;
}

export async function getTags(): Promise<Tag[]> {
  'use cache';
  cacheTag('tags');
  cacheLife('hours', 1);

  return db.select().from(tags).orderBy(tags.name);
}
```

### Request Memoization

For data fetched multiple times per request (e.g., current user):

```typescript
// lib/auth.ts
import { cache } from 'react';
import { getAuthGateway } from './container';

// Memoize within a single request
export const getCurrentUser = cache(async () => {
  const authGateway = getAuthGateway();
  return authGateway.getCurrentUser();
});

// Usage in multiple components - only one DB call
// layout.tsx: const user = await getCurrentUser();
// header.tsx: const user = await getCurrentUser(); // Uses memoized result
```

### Static Generation with ISR

Marketing pages use ISR for fast loads with periodic updates:

```typescript
// app/(marketing)/pricing/page.tsx
import { Suspense } from 'react';

// Revalidate every hour
export const revalidate = 3600;

export default function PricingPage() {
  return (
    <div>
      <h1>Pricing</h1>
      <PricingCards />
    </div>
  );
}
```

### No Caching (Real-time Data)

User-specific, frequently changing data should NOT be cached:

```typescript
// app/(app)/app/dashboard/page.tsx
// Force dynamic rendering for user stats
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // Always fetch fresh stats
  const stats = await getUserStats(user.id);

  return <Dashboard stats={stats} />;
}
```

### Cache Invalidation

When content changes (seed script runs):

```typescript
// scripts/seed.ts
import { revalidateTag } from 'next/cache';

async function seed() {
  // ... seed questions and tags ...

  // Invalidate caches
  revalidateTag('questions');
  revalidateTag('tags');

  console.log('Cache invalidated');
}
```

### API Route Caching

For public API routes that can be cached:

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  // Health check should not be cached
  return NextResponse.json(
    { ok: true, timestamp: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
```

### What NOT to Cache

1. **Authentication state** — Always verify fresh
2. **Subscription status** — Could change via Stripe webhook
3. **User attempts** — Real-time for accurate stats
4. **Practice sessions** — Active state changes frequently
5. **Stripe API calls** — Always hit their API

### Clean Architecture and Caching

Caching is an **infrastructure concern** — it lives in the Frameworks layer:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      FRAMEWORKS (Next.js)                                │
│                                                                          │
│   Page components decide caching strategy                               │
│   `use cache`, revalidateTag, Cache-Control headers                     │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     ADAPTERS                                     │   │
│   │                                                                  │   │
│   │   Repository implementations may use cache()                    │   │
│   │   But caching policy comes from Frameworks layer               │   │
│   │                                                                  │   │
│   │   ┌─────────────────────────────────────────────────────────┐   │   │
│   │   │              USE CASES + DOMAIN                          │   │   │
│   │   │                                                          │   │   │
│   │   │   NO CACHING AWARENESS                                   │   │   │
│   │   │   Pure business logic                                    │   │   │
│   │   └─────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Performance Monitoring

Track cache effectiveness:

```typescript
// lib/cache-metrics.ts
export async function withCacheMetrics<T>(
  key: string,
  fn: () => Promise<T>,
  isCached: boolean
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  logger.debug({
    cache: key,
    hit: isCached,
    durationMs: Math.round(duration),
  });

  return result;
}
```

## Consequences

### Positive

1. **Fast Loads** — Static and cached content loads instantly
2. **Reduced DB Load** — Question queries cached
3. **Explicit Control** — Next.js 16 opt-in model is clear
4. **Correct Data** — Real-time data stays fresh

### Negative

1. **Complexity** — Must think about what to cache
2. **Stale Data Risk** — Cached content may lag behind DB

### Mitigations

- Clear cache invalidation strategy
- Conservative TTLs (1 hour max)
- Explicit `dynamic = 'force-dynamic'` for user data

## Compliance Checklist

- [ ] User-specific data NOT cached across requests
- [ ] Subscription status fetched fresh
- [ ] Cache invalidation runs after seed script
- [ ] Static pages have appropriate revalidation
- [ ] No caching logic in domain/use case layers

## References

- [Next.js 16 - Cache Components](https://nextjs.org/blog/next-16)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [React cache() function](https://react.dev/reference/react/cache)
