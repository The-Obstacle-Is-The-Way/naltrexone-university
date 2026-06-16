# ADR-010: Caching Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

We need performance without correctness regressions:

- Questions/tags are read-heavy and can be cached safely.
- User-specific state (subscription status, attempts, stats) must remain fresh.
- Next.js 16 offers explicit caching primitives, but misuse here risks stale
  entitlement and answer-state bugs.

---

## Decision

### Where We Cache

- **Framework layer only** (pages/controllers/repositories).
- **Never** in domain or application layers.

### Current Runtime Position

- Cache Components are enabled (`cacheComponents: true`), and explicit
  app-level `'use cache'` exists for static public marketing/pricing fragments.
- No published question/tag repository read is cross-request cached with
  `cacheTag`, `cacheLife`, `revalidateTag`, or `unstable_cache` today.
- The current codebase uses targeted invalidation only where needed. The active
  example is `revalidatePath(ROUTES.APP_BOOKMARKS)` in
  `app/(app)/app/bookmarks/bookmarks-actions.ts`.
- This ADR is therefore still conservative for user-facing data: future
  question/tag read caching must follow the rules below.

### What We Cache

- Published question content and tag lists: cacheable.
- Subscription status: do not cache across requests (webhooks can change it).
- Attempts/stats: do not cache across requests.

### Invalidation

- Next.js cache invalidation APIs (`revalidateTag`, `revalidatePath`) are only used inside:
  - Server Actions
  - Route Handlers

Do not call Next.js cache invalidation from standalone scripts (e.g., `scripts/seed.ts`), since they do not run inside the Next.js runtime.

---

## Consequences

### Positive

- Predictable caching model (explicit opt-in only)
- Avoids stale entitlement/security bugs

### Negative

- Requires discipline to avoid caching user-specific reads
- Offers fewer performance wins until explicit content caching is introduced
  safely

---

## References

- Next.js caching: https://nextjs.org/docs/app/building-your-application/caching
- Cache Components (Next.js 16): https://nextjs.org/docs/app/api-reference/next-config-js/cacheComponents
