# DEBT-121: Use Case Fakes Don't Implement Interfaces (No Compile-Time Safety)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

In `src/application/test-helpers/fakes.ts`, all 9 repository fakes and 4 gateway fakes properly `implements` their port interface, giving compile-time guarantees that they match real signatures.

However, all 13 use-case fakes are free-form classes with no interface enforcement:

- `FakeToggleBookmarkUseCase` (line 264)
- `FakeGetBookmarksUseCase` (line 279)
- `FakeStartPracticeSessionUseCase` (line 294)
- `FakeEndPracticeSessionUseCase` (line 311)
- `FakeCreateCheckoutSessionUseCase` (line 328)
- `FakeCreatePortalSessionUseCase` (line 345)
- `FakeGetMissedQuestionsUseCase` (line 362)
- `FakeGetIncompletePracticeSessionUseCase` (line 379)
- `FakeGetPracticeSessionReviewUseCase` (line 396)
- `FakeGetUserStatsUseCase` (line 413)
- `FakeGetNextQuestionUseCase` (line 428)
- `FakeSubmitAnswerUseCase` (line 443)
- `FakeSetPracticeSessionQuestionMarkUseCase` (line 458)

If a real use case's `execute()` signature changes (e.g., new parameter added), the fake won't fail at compile time — it'll only fail at runtime in tests, or worse, silently accept stale signatures.

## Impact

- No compile-time contract between real use cases and their fakes
- Signature drift can go undetected until a test runs (or doesn't run the right path)
- Inconsistent with the repository/gateway fakes which properly implement interfaces
- Violates Liskov Substitution Principle — fakes should be substitutable for real implementations

## Resolution

### Option A: Extract Use Case Interfaces (Recommended)

For each use case, export an interface from the use case file:

```typescript
// src/application/use-cases/submit-answer.ts
export interface ISubmitAnswerUseCase {
  execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput>;
}

export class SubmitAnswerUseCase implements ISubmitAnswerUseCase { ... }
```

Then in fakes:

```typescript
export class FakeSubmitAnswerUseCase implements ISubmitAnswerUseCase { ... }
```

### Option B: Use Case Port Pattern

Define use case contracts in `src/application/ports/use-cases.ts` alongside repository ports. This is more formal but may feel heavy for use cases.

## Verification

- [ ] All 13 use-case fakes implement their corresponding interface
- [ ] TypeScript compilation catches signature mismatches between real and fake use cases
- [ ] Existing test suite passes
- [ ] No behavioral changes

## Related

- `src/application/test-helpers/fakes.ts` (lines 264-473)
- Repository fakes (lines 474+) — correctly implement interfaces (good pattern to follow)
- Gateway fakes — correctly implement interfaces
