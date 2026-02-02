# DEBT-050: Missing Fake Implementations for 5 Repositories

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The test helpers in `src/application/test-helpers/fakes.ts` are missing fake implementations for 5 repositories. This forces controller tests to use `vi.fn()` mocks instead of proper fakes, violating CLAUDE.md guidance.

**Missing fakes:**
1. `FakeUserRepository`
2. `FakeStripeCustomerRepository`
3. `FakeStripeEventRepository`
4. `FakeBookmarkRepository`
5. `FakeTagRepository`

**Existing fakes:**
- `FakeQuestionRepository` ✓
- `FakeAttemptRepository` ✓
- `FakePracticeSessionRepository` ✓
- `FakeSubscriptionRepository` ✓
- `FakePaymentGateway` ✓

## Impact

- Controllers that use these repositories can't be properly unit tested
- Tests use `vi.fn()` mocks instead of behavioral fakes
- Mocks test implementation details, not behavior
- Tests break when implementation changes, even if behavior is correct
- Violates CLAUDE.md: "NEVER use vi.mock() for our own code"

## Resolution

Implemented all 5 fake repositories in `src/application/test-helpers/fakes.ts`:

1. **FakeUserRepository**: `Map<clerkId, {user, clerkId}>` storage with auto-incrementing IDs
   - `findByClerkId()` - returns null or user
   - `upsertByClerkId()` - creates new user or updates email

2. **FakeBookmarkRepository**: `Map<"userId:questionId", Bookmark>` composite key storage
   - `exists()`, `add()`, `remove()`, `listByUserId()`
   - Idempotent add (returns existing)

3. **FakeTagRepository**: Simple array storage with constructor seeding
   - `listAll()` returns all seeded tags

4. **FakeStripeCustomerRepository**: Bidirectional 1:1 mapping with two Maps
   - `findByUserId()`, `insert()`
   - Throws CONFLICT for conflicting mappings

5. **FakeStripeEventRepository**: `Map<eventId, {type, processedAt, error}>` storage
   - `claim()`, `lock()`, `markProcessed()`, `markFailed()`
   - Throws NOT_FOUND for missing events on lock

## Verification

- [x] All 5 fake repositories implemented
- [x] Fakes cover all interface methods
- [x] 27 unit tests added for fake implementations
- [x] All 384 tests pass
- [x] TypeScript compiles without errors

## Related

- `src/application/test-helpers/fakes.ts`
- `src/application/test-helpers/fakes.test.ts`
- `src/application/ports/repositories.ts`
- CLAUDE.md: "Fakes over mocks" section
- DEBT-051: Controller tests use vi.fn() instead of fakes
