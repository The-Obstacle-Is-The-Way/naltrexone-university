# DEBT-227: Split fake-repositories.ts Into Individual Files

**Status:** Open
**Priority:** P3
**Date:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/test-helpers/fakes/fake-repositories.ts`

---

## Description

`fake-repositories.ts` is **1,127 lines** containing 11 independent fake repository implementations bundled into a single file:

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

Each fake is independently testable and used in different test contexts. This was previously flagged at 1,472 lines in DEBT-163 and reduced, but it remains the largest non-test file by 2x.

**Disposition:** B — Multiple responsibilities that should be split.

## Impact

- Cognitive load: developers must scroll through 1,100+ lines to find the fake they need
- Merge conflicts: any change to any fake touches this single file
- Discoverability: new contributors may not realize which fakes exist

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
  index.ts  (barrel re-export for backwards compatibility)
```

Keep `fake-repositories.ts` as a barrel re-export during transition, then delete once all imports are updated.

## Verification

- [ ] Each fake has its own file
- [ ] Barrel `index.ts` re-exports all fakes
- [ ] All existing imports resolve (update to barrel or direct imports)
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes
- [ ] Old `fake-repositories.ts` deleted

## Related

- [DEBT-163](../_archive/debt/debt-163-fakes-file-approaching-split-threshold.md) — Previous threshold flag
- [DEBT-228](debt-228-dry-fake-use-cases-with-generic-base.md) — Companion: DRY up fake-use-cases.ts
