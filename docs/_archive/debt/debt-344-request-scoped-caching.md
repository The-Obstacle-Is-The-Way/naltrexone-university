# DEBT-344: Request-Scoped Auth/Entitlement Dedup + Static Read Caching

**Priority:** P2
**Created:** 2026-04-02
**Resolved:** 2026-04-03
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [ADR-010 Caching Strategy](../../adr/adr-010-caching-strategy.md), [SPEC-016 Observability](../../specs/spec-016-observability.md), [DEBT-349 Cross-Request Published Content Caching](./debt-349-cross-request-published-content-caching.md)

---

## Context

ADR-010 permits framework-layer caching for published question content and tag
lists, while forbidding stale subscription, entitlement, attempt, and stats
data across requests.

Finding 1 was resolved on 2026-04-02 in [`lib/auth-request-cache.ts`](../../../lib/auth-request-cache.ts).
This debt remained open only for Tier 1 request-scoped dedup of immutable
published question and tag reads.

## Verified Read Paths

The implementation was verified against the real source before landing:

- [`src/adapters/repositories/drizzle-question-repository.ts`](../../../src/adapters/repositories/drizzle-question-repository.ts) reads published questions fresh in `findPublishedById`, `findPublishedBySlug`, and `findPublishedByIds`.
- [`src/application/shared/fetch-questions-by-id.ts`](../../../src/application/shared/fetch-questions-by-id.ts) already removes duplicate ids inside a single batch call, but does not deduplicate across separate callers in the same request.
- [`src/adapters/controllers/tag-controller.ts`](../../../src/adapters/controllers/tag-controller.ts) always calls `tagRepository.listAll()`.
- [`src/adapters/controllers/question-view-controller.ts`](../../../src/adapters/controllers/question-view-controller.ts) calls `findPublishedBySlug(...)`.

Important source-verified nuance:

- The dashboard server render already does `Promise.all([getUserStats({}), getSessionHistory(...)])`, so multiple server-render controllers/use cases can reuse question reads in one request.
- The history questions tab already does `Promise.all([getAttemptedQuestions(...), getTags({})])`, so the same render can reuse the static tag list.
- The question page and practice session question loads are mostly client-triggered controller calls after mount, so they are separate requests, not a single shared server render.

## Resolution

Tier 1 shipped on 2026-04-03:

- Added [`lib/cached-reads.ts`](../../../lib/cached-reads.ts) with request-scoped `React.cache` wrappers for:
  - `findPublishedById(id)`
  - `findPublishedBySlug(slug)`
  - `findPublishedByIds(ids)` keyed by normalized id lists
  - `listAll()` tag reads
- Updated [`lib/controller-helpers.ts`](../../../lib/controller-helpers.ts) so the default `loadAppContainer()` path builds the production container with request-scoped cached question/tag repository overrides.
- Preserved DI seams:
  - Explicit injected deps still bypass the cache path.
  - Custom `loadContainer` overrides still bypass the cache path.
- Kept the change in the framework layer only. No domain, application, or adapter implementation code changed.
- Did not add Tier 2 cross-request caching primitives (`unstable_cache`, `use cache`, `cacheTag`, `revalidateTag`).

## Tests

- [`lib/cached-reads.test.ts`](../../../lib/cached-reads.test.ts) uses the same subprocess + `renderToReadableStream` harness pattern as [`lib/auth-request-cache.test.ts`](../../../lib/auth-request-cache.test.ts) to prove:
  - same-render dedup for repeated question-by-id reads
  - same-render dedup for repeated tag-list reads
  - fresh rechecks on a new render
- Hermetic verification passed with fake `STRIPE_SECRET_KEY` and `CLERK_SECRET_KEY`.

## Outcome

DEBT-344 is resolved for the approved Tier 1 scope.

Optional Tier 2 cross-request caching for immutable published questions and tag
lists is tracked separately in [DEBT-349](./debt-349-cross-request-published-content-caching.md)
(deferred / parked — not resolved).
