# BUG-189: Question Review Cross-Slug Async State Corruption

**Status:** Open
**Priority:** P2
**Date:** 2026-03-03

---

## Description

Question review async operations are not request-scoped to the current slug. Under quick navigation, stale async responses can overwrite state for a different question.

Observed behavior:
- Out-of-order question loads can render the wrong question for the current slug.
- Stale previous-attempt hydration can prefill answer/result state for a different question.
- Stale submit responses can apply to the wrong slug after navigation during pending submit.

Expected behavior:
- Async responses should only commit if they match the latest slug/request context.

## Steps to Reproduce

1. Open a review flow with session navigation (`mode=review&sessionId=...`).
2. Throttle network.
3. Navigate quickly between questions while load/hydration/submit requests are in flight.
4. Observe stale responses mutating current state (wrong question content or feedback state).

## Root Cause

Tracer-bullet path:
1. Controller loads by slug through `createLoadQuestionAction` in [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:121), triggered by [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:141).
2. `loadQuestion` in [question-page-logic.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-logic.ts:96) commits results without a request-sequence/token guard (only mounted-check).
3. Previous-attempt hydration effect in [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:306) calls [question-page-logic.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-logic.ts:281) with no stale-request token.
4. Submit action is created from live `question` state in [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:374), but submit commit in [question-page-logic.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-logic.ts:257) is not slug-scoped.
5. Navigation links remain active while submit is pending in [question-page-client.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-client.tsx:348) and [question-page-client.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-client.tsx:398), increasing race likelihood.

## Fix

Not yet implemented.

Expected fix shape:
- Add request sequencing (same pattern used in `runLoadQuestionFlow`) for question load, previous-attempt hydration, and submit commit paths.
- Gate state commits by latest slug/request id.
- Optionally disable slug-navigation links while submit/hydration is in flight.

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

## Related

- Existing partial protection: stale session-review fetch guard exists, but only for session-navigation fetches.
