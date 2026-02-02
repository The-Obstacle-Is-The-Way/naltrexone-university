# DEBT-053: Unused TagRepository — Wired But Never Called

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The `TagRepository` interface is defined, implemented as `DrizzleTagRepository`, and wired in the container — but no controller ever uses it. This is dead infrastructure.

**What exists:**
- Interface: `src/application/ports/repositories.ts:99-101`
- Implementation: `src/adapters/repositories/drizzle-tag-repository.ts`
- Container wiring: `lib/container.ts:144-145`

**What's missing:**
- Any controller that calls `tagRepository.findAll()` or similar
- An endpoint to list available tags for filtering
- Tag management UI

## Impact

- Dead code adds maintenance burden
- Container creates unused repository instance
- Test coverage for repository is pointless without usage
- Confusing for developers: "Why does this exist?"

## Resolution

**Option A: Use it** (implement tag filtering UI)
1. Create `/api/tags` endpoint or server action
2. Add tag filter dropdown to practice page
3. TagRepository becomes useful

**Option B: Remove it** (if tags are only used internally)
1. Delete `TagRepository` interface from ports
2. Delete `DrizzleTagRepository` implementation
3. Remove from container wiring
4. Keep tags in schema (still used via question relations)

## Verification

If keeping:
- [ ] Endpoint or action exposes tags to frontend
- [ ] UI allows filtering by tag

If removing:
- [ ] Interface deleted
- [ ] Implementation deleted
- [ ] Container wiring removed
- [ ] No references remain

## Related

- `src/application/ports/repositories.ts:99-101`
- `src/adapters/repositories/drizzle-tag-repository.ts`
- `lib/container.ts:144-145`
