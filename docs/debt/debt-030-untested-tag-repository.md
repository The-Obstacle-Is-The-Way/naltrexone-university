# DEBT-030: Untested Tag Repository

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

`drizzle-tag-repository.ts` has no corresponding test file. While less critical than payment infrastructure, it should follow the same testing standards as other repositories in the codebase.

## Location

- **File:** `src/adapters/repositories/drizzle-tag-repository.ts`
- **Missing:** `src/adapters/repositories/drizzle-tag-repository.test.ts`

## Methods Requiring Tests

```typescript
interface TagRepository {
  listAll(filter?: { kind?: TagKind }): Promise<Tag[]>;
}
```

## Impact

- **Consistency:** All other repositories have tests
- **Regression Risk:** Filtering/ordering changes could break without detection
- **Documentation:** Tests serve as living documentation of expected behavior

## Resolution

Create test file covering:

1. **listAll() without filter:**
   - Returns all tags
   - Tags ordered correctly (by name or id)

2. **listAll() with kind filter:**
   - Returns only tags of specified kind
   - Empty result when no tags match

3. **Tag mapping:**
   - Database rows correctly mapped to domain Tag entities

## Acceptance Criteria

- [ ] Test file exists at `src/adapters/repositories/drizzle-tag-repository.test.ts`
- [ ] Unit tests cover listAll() with and without filters
- [ ] Tests verify correct ordering
- [ ] Tests verify domain entity mapping

## Related

- SPEC-007: Repository Implementations
- ADR-003: Testing Strategy
