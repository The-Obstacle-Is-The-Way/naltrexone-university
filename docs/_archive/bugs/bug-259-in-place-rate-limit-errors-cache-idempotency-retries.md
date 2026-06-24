# BUG-259: In-Place Answer, Bookmark, and Feedback Rate-Limit Errors Are Cached Under Idempotency Keys

**Status:** Resolved
**Severity:** P4
**Date:** 2026-06-23
**Confirmed:** 2026-06-23
**Resolved:** 2026-06-24
**Component:** Answer Submission / Bookmarks / Question Feedback / Idempotency / Rate Limiting

---

## Resolution

Fixed by hoisting each rate-limit check **before** `executeIdempotent` (after authentication), so a denied `RATE_LIMITED` `ApplicationError` is no longer thrown inside the idempotent closure and cached under the client idempotency key. Applied to the four in-place surfaces (`submitAnswer`, `toggleBookmark`, `rateQuestion`, `submitQuestionReport`) plus a consistency hoist of `startPracticeSession`; this matches the deliberate billing-controller ordering (BUG-204). Controller-side only — action names, idempotency keys, schemas, output parsing, and use-case calls are unchanged; no client / domain / application / schema change.

A spec audit during implementation widened the documented scope from bookmark/feedback to **answer/bookmark/feedback** (the `submitAnswer` path has the identical antipattern). CodeRabbit then flagged that limiter-before-`executeIdempotent` also gates idempotent **replays** behind the limiter (a retry with the same key while rate-limited returns `RATE_LIMITED` instead of the stored result). That residual is transient/self-healing and consistent with the established billing pattern; the ideal "rate-limit on cache-miss only" semantics is tracked as **DEBT-424** (filed and independently audited in the same PR).

TDD: per-surface controller tests proving a `RATE_LIMITED` first call is not cached under a reused key (red→green), plus success-still-idempotent and genuine-use-case-error-still-cached guards. Full gate green (typecheck, lint, unit 2948, build).

Shipped via PR #508 (squash `e8c74fea` on `dev`; CodeRabbit `APPROVED` the code on head `1638cc55`, 0 unresolved threads; the post-approval delta was docs-only — DEBT-424 + this doc's nit — with CR of that docs differential waived by owner) → promoted to `main` via PR #509 (merge `c72c01ab`). Vercel's git integration skipped the production build for the merge commit (build-dedup against the byte-identical `dev` preview `e8c74fea`), so production was force-redeployed with `vercel deploy --prod`; production deploy `dpl_EpnW95vSdj24jj6WymRTwdKbwQXg` (commit `c72c01ab`) verified READY 2026-06-24 (`addictionboards.com` HTTP 200). `main` and `dev` trees identical.

The Root Cause citations below describe the pre-fix code (line numbers predate the fix).

---

## Summary

The in-place answer submit, bookmark toggle, question rating, and question report flows keep the same client idempotency key after a failed request. Their controllers run rate-limit checks inside the idempotent operation. When a real `RATE_LIMITED` response happens, `withIdempotency` stores that `ApplicationError` under the key and replays it for repeated requests until the idempotency row expires. A user can wait out the one-minute rate-limit window and still get the cached rate-limit error from the same page.

This does not affect the bookmarks page removal form: that path redirects after failure and gets a fresh rendered hidden key on the next page render.

## Reachability

Reachable by a normal subscribed user who repeatedly submits answers, toggles a bookmark/rating, or submits reports quickly enough to hit the configured limiter, then retries the same in-place control after the limiter window should have reset. The answer-submit path is reachable from tutor/standalone submit flows; production exam mode still does not render a per-question submit button. The harm is narrow and recoverable by reload, route change, question change, or idempotency expiry, so this is P4 rather than a data-integrity or availability bug.

## Reproduction

1. Open a practice/review question as an entitled user.
2. Repeatedly invoke one in-place action until the server returns `RATE_LIMITED`:
   - answer submit: 120 submissions per minute,
   - bookmark toggle: 60 changes per minute,
   - rating: 60 changes per minute,
   - report: 10 reports per minute.
3. Wait longer than the one-minute rate-limit window.
4. Click the same control again on the same page/question.

Expected: once the limiter window has reset, the action should execute or fail from fresh server state.

Actual: the client reuses the same idempotency key, and the server replays the cached `RATE_LIMITED` error attached to that key.

## Root Cause

The in-place clients retain an idempotency key until success:

- [`bookmark-toggle.ts`](<../../../app/(app)/app/shared/bookmark-toggle.ts#L33>) reuses the existing bookmark idempotency key or creates one.
- [`bookmark-toggle.ts`](<../../../app/(app)/app/shared/bookmark-toggle.ts#L36>) persists a generated key before the request.
- [`bookmark-toggle.ts`](<../../../app/(app)/app/shared/bookmark-toggle.ts#L63>) returns on non-ok results before the success-only rotation at [`bookmark-toggle.ts`](<../../../app/(app)/app/shared/bookmark-toggle.ts#L87>).
- [`question-feedback-actions.ts`](<../../../app/(app)/app/shared/question-feedback-actions.ts#L40>) does the same for ratings, with error return at [`question-feedback-actions.ts`](<../../../app/(app)/app/shared/question-feedback-actions.ts#L74>) before success rotation at [`question-feedback-actions.ts`](<../../../app/(app)/app/shared/question-feedback-actions.ts#L91>).
- [`question-feedback-actions.ts`](<../../../app/(app)/app/shared/question-feedback-actions.ts#L113>) does the same for reports, with error return at [`question-feedback-actions.ts`](<../../../app/(app)/app/shared/question-feedback-actions.ts#L146>) before success rotation at [`question-feedback-actions.ts`](<../../../app/(app)/app/shared/question-feedback-actions.ts#L163>).
- [`question-flow-actions.ts`](<../../../app/(app)/app/practice/shared/question-flow-actions.ts#L237>) submits answers with the current submit idempotency key; non-ok results return at [`question-flow-actions.ts`](<../../../app/(app)/app/practice/shared/question-flow-actions.ts#L297>) without rotating it.
- [`question-page-logic.ts`](<../../../app/(app)/app/questions/[slug]/question-page-logic.ts#L248>) does the same for standalone question submits; non-ok results return at [`question-page-logic.ts`](<../../../app/(app)/app/questions/[slug]/question-page-logic.ts#L283>) without rotating the key.
- `error` state does not block answer retry: [`practice-page-logic.ts`](<../../../app/(app)/app/practice/practice-page-logic.ts#L41>) and [`question-page-logic.ts`](<../../../app/(app)/app/questions/[slug]/question-page-logic.ts#L101>) only block submit while loading.
- The current bookmark helper test locks the failure behavior in at [`bookmark-toggle.test.ts`](<../../../app/(app)/app/shared/bookmark-toggle.test.ts#L59>).

Before this fix, the affected controllers ran the rate-limit check inside the idempotent closure (this branch hoists each one before `executeIdempotent`; the line anchors below describe the pre-fix code):

- [`question-controller.ts`](../../../src/adapters/controllers/question-controller.ts#L236) performs the answer-submit limiter inside `submitOnce()`, then passes that function to `executeIdempotent` at [`question-controller.ts`](../../../src/adapters/controllers/question-controller.ts#L259).
- [`bookmark-controller.ts`](../../../src/adapters/controllers/bookmark-controller.ts#L81) performs the bookmark limiter inside `toggle()`, then passes that function to `executeIdempotent` at [`bookmark-controller.ts`](../../../src/adapters/controllers/bookmark-controller.ts#L99).
- [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L131) performs the rating limiter inside the idempotent operation.
- [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L183) performs the report limiter inside the idempotent operation.
- The configured rate windows are one minute in [`rate-limits.ts`](../../../src/adapters/shared/rate-limits.ts#L32), [`rate-limits.ts`](../../../src/adapters/shared/rate-limits.ts#L47), [`rate-limits.ts`](../../../src/adapters/shared/rate-limits.ts#L52), and [`rate-limits.ts`](../../../src/adapters/shared/rate-limits.ts#L57).

`withIdempotency` deliberately caches completed errors:

- [`with-idempotency.ts`](../../../src/adapters/shared/with-idempotency.ts#L11) defaults idempotency TTL to `DAY_MS`.
- [`with-idempotency.ts`](../../../src/adapters/shared/with-idempotency.ts#L77) sets `expiresAt` from that TTL.
- [`with-idempotency.ts`](../../../src/adapters/shared/with-idempotency.ts#L96) stores thrown errors with `storeError`.
- [`with-idempotency.ts`](../../../src/adapters/shared/with-idempotency.ts#L141) rethrows stored errors for repeated keys.
- [`with-idempotency.test.ts`](../../../src/adapters/shared/with-idempotency.test.ts#L270) explicitly verifies a stored `RATE_LIMITED` `ApplicationError` is replayed and the operation executes only once.

## Impact

After a legitimate rate-limit response, an in-page answer submit, bookmark, rating, or report retry can remain wedged on the same cached error long after the limiter window has reset. The user's answer/bookmark/feedback intent is delayed until reload/navigation/key expiry.

## Proposed Fix

Move the answer-submit, bookmark, rating, and report rate-limit checks before `executeIdempotent`, matching the billing controller pattern. A rate-limit denial is not the result of the mutation and should not be cached under the mutation's idempotency key. Successful mutations and use-case failures should keep the existing idempotent replay behavior.

Implementation outline:

1. In `submitAnswer`, run the submit-answer limiter after authentication and before defining/executing the idempotent mutation.
2. In `toggleBookmark`, run the bookmark limiter after authentication and before defining/executing the idempotent mutation.
3. In `rateQuestion` and `submitQuestionReport`, run the corresponding limiter before `executeIdempotent`.
4. Keep action names, idempotency keys, output schemas, and use-case calls unchanged.
5. Add controller tests proving that a first call returning `RATE_LIMITED` with an idempotency key does not cache the error: when the fake limiter allows a second call with the same key, the mutation executes.

Rejected alternatives:

- Rotate client idempotency keys after every error: helps honest UI retries, but leaves crafted clients and any missed UI path able to cache `RATE_LIMITED` errors.
- Teach `withIdempotency` not to cache `RATE_LIMITED` globally: broader semantic change that affects all idempotent actions, including surfaces where cached application errors may be intentional.
- Shorten idempotency TTL: weakens legitimate replay protection and still leaves the retry stuck for whatever shorter TTL is chosen.

## Related hardening (defense-in-depth)

`startPracticeSession` (`practice-controller.ts`) has the same limiter-inside-`executeIdempotent` shape, but it is **not** a reachable instance of this bug: its client rotates the idempotency key on failure (`practice-page-session-start.ts` rotates on both the thrown-error and non-ok paths), so an honest retry never reuses the key that cached the `RATE_LIMITED` error. It is hoisted alongside the four reachable surfaces purely for consistency — making "rate-limit before idempotency" uniform across every idempotent server action and removing the latent footgun should that client ever stop rotating. `discardPracticeSession` already follows the safe ordering and is unchanged.

## Failing Test Sketch

```ts
it('does not cache bookmark RATE_LIMITED errors under the idempotency key', async () => {
  const deps = createDeps({
    rateLimitResult: [
      { success: false, limit: 60, remaining: 0, retryAfterSeconds: 60 },
      { success: true, limit: 60, remaining: 59, retryAfterSeconds: 0 },
    ],
  });

  const input = {
    questionId,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
  };

  const first = await toggleBookmark(input, deps);
  const second = await toggleBookmark(input, deps);

  expect(first).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  expect(second).toEqual({ ok: true, data: { bookmarked: true } });
  expect(deps.toggleBookmarkUseCase.inputs).toHaveLength(1);
});
```

Mirror the same shape for `submitAnswer`, `rateQuestion`, and `submitQuestionReport`. Today these tests fail because the first rate-limited call is stored as the idempotency result and the second call replays the cached error without invoking the mutation.

## Prior Bug Cross-Refs

- BUG-198 fixed crash-abandoned, incomplete idempotency keys. BUG-259 is different: the key is completed with a stored error.
- BUG-231 fixed a missing idempotency key on the bookmarks removal form. BUG-259 affects in-place controls that do send a key.
- BUG-204 and later billing fixes use rate-limit-before-idempotency ordering for checkout/portal actions; this bug is the answer/bookmark/feedback divergence from that safer pattern.
