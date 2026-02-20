# DEBT-227: Split fake-repositories.ts Into Individual Files

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-18
**Resolved:** 2026-02-19
**Last Verified:** 2026-02-19
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/test-helpers/fakes/fake-repositories.ts`

---

## Description

`fake-repositories.ts` is **1,127 lines** containing **10** independent fake repository implementations bundled into one file:

1. `FakeQuestionRepository`
2. `FakeAttemptRepository`
3. `FakePracticeSessionRepository`
4. `FakeSubscriptionRepository`
5. `FakeUserRepository`
6. `FakeBookmarkRepository`
7. `FakeTagRepository`
8. `FakeStripeCustomerRepository`
9. `FakeStripeEventRepository`
10. `FakeIdempotencyKeyRepository`

Each fake is independently testable and used in different test contexts. This was previously flagged at 1,472 lines in DEBT-163 and reduced, but it remains the largest non-test file by a wide margin.

**Disposition:** B - Multiple responsibilities should be split.

## Impact

- Cognitive load: developers must scroll through 1,100+ lines to find the fake they need
- Merge conflicts: any change to any fake touches this single file
- Discoverability: new contributors may not realize which fakes exist

## Why This Is Worth Fixing

- **Robustness gain:** isolate fake behavior per repository so test changes are safer and easier to review.
- **Complexity risk to avoid:** do not introduce extra abstraction layers; this should be a physical file split plus stable exports.

## Resolution

Split into one file per fake repository:

```
src/application/test-helpers/fakes/
  fake-question-repository.ts
  fake-attempt-repository.ts
  fake-practice-session-repository.ts
  fake-subscription-repository.ts
  fake-user-repository.ts
  fake-bookmark-repository.ts
  fake-tag-repository.ts
  fake-stripe-customer-repository.ts
  fake-stripe-event-repository.ts
  fake-idempotency-key-repository.ts
  index.ts  (barrel re-export; already exists and should be updated)
```

Implementation sequence:

1. Move each class to its own file.
2. Update `src/application/test-helpers/fakes/index.ts` to export from the new files.
3. Keep `fake-repositories.ts` as a temporary compatibility barrel only during migration.
4. Delete `fake-repositories.ts` after import updates are complete.

## Verification

- [x] Each fake has its own file
- [x] `src/application/test-helpers/fakes/index.ts` re-exports all fake repositories
- [x] All existing imports resolve (barrel or direct imports)
- [x] `pnpm test --run` passes
- [x] `pnpm typecheck` passes
- [x] Old `fake-repositories.ts` deleted

## Related

- [DEBT-163](debt-163-fakes-file-approaching-split-threshold.md) - Previous threshold flag
- [DEBT-228](debt-228-dry-fake-use-cases-with-generic-base.md) - Companion: DRY fake use case helpers
