# DEBT-053: Unused TagRepository — Wired But Never Called

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The `TagRepository` port and `DrizzleTagRepository` adapter existed and were wired in the container, but there was no controller/UI path that ever called `tagRepository.listAll()`.

## Impact

- Dead code adds maintenance burden
- Container creates unused repository instance
- Test coverage for repository is pointless without usage
- Confusing for developers: "Why does this exist?"

## Resolution

Implemented an entitled-only tag listing controller and used it in the practice UI:

- Added `src/adapters/controllers/tag-controller.ts` with `getTags()`.
- Wired `createTagControllerDeps()` in `lib/container.ts`.
- `app/(app)/app/practice/page.tsx` calls `getTags({})` and exposes tag/difficulty filters, which now flow into:
  - one-question practice (`getNextQuestion` filters)
  - session creation (`startPracticeSession` params)

## Verification

- [x] Unit tests: `src/adapters/controllers/tag-controller.test.ts` passes.
- [x] Practice page logic tests updated to pass filters through to controllers.

## Related

- `src/adapters/controllers/tag-controller.ts`
- `src/adapters/repositories/drizzle-tag-repository.ts`
- `app/(app)/app/practice/page.tsx`
