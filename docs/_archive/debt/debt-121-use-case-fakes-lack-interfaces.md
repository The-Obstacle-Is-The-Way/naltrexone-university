# DEBT-121: Use Case Fakes Don't Implement Interfaces (No Compile-Time Safety)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06

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

## Resolution (Implemented)

Implemented Option B (use-case port pattern):

- Added generic use-case contract:
  - `src/application/ports/use-cases.ts`
  - `UseCase<Input, Output> = { execute(input): Promise<Output> }`
- Updated all fake use-case classes to implement `UseCase<...>` in:
  - `src/application/test-helpers/fakes.ts`
- Preserved existing fake behavior while adding compile-time signature checks.

## Verification

- [x] All fake use-case classes implement a shared interface contract
- [x] TypeScript catches execute-signature drift at compile time
- [x] Existing test suite passes
- [x] No runtime behavior changes

## Related

- `src/application/ports/use-cases.ts`
- `src/application/test-helpers/fakes.ts`
