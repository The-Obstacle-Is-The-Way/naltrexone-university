# BUG-298: Preserved Idempotency Keys Remain Unbound to Request Identity on Submit-Answer, Mark-for-Review, and Bookmark — and the Feedback Replay Guard Ignores Attempt/Session Context

**Status:** Open
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (wave-2 close adversarial regression review; all four legs confirmed 3/3 by the verification panels — submit and mark corroborated by two and three independent finder lenses respectively — and re-verified at source in the orchestrating session)
**Component:** Idempotency client key lifecycle (practice submit, mark-for-review, bookmarks, feedback replay guard)

---

## Summary

[BUG-295](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) codified the invariant — *a preserved key must be bound to the request identity it was minted for and retired once its outcome is consumed* — and implemented it for the feedback rating/report client tokens. The same wave's PR #640 taught the sibling surfaces to **preserve** keys across indeterminate outcomes (rotation now happens only on determinate cached errors), but those surfaces never received the binding half. Three client legs and one server leg violate the invariant:

1. **Submit-answer (worst leg):** the shared submit key is minted on question load and travels with whatever `selectedChoiceId` the user currently has ([`question-flow-actions.ts#L388-L389`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L388-L389>)). After an indeterminate failure (e.g. client timeout with a committed-and-cached server success), the question, the selection, and Submit stay rendered; the user can change their choice and resubmit. The wrapper replays the cached graded result **for the old choice**, and the UI presents it as the grade for the new one — a silently wrong grade display.
2. **Mark-for-review:** a single lazily-minted, session-page-scoped key ref serves every mark toggle ([`use-practice-session-mark-for-review.ts#L90-L94`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L90-L94>)), preserved across transient failures but bound to neither `questionId` nor the desired mark state — a cached success for question A can be replayed for a toggle on question B, which is then reported as marked/unmarked without any write.
3. **Bookmark toggle:** the per-question key is not bound to `desiredBookmarked` ([`bookmark-toggle.ts#L52-L53`](<../../app/(app)/app/shared/bookmark-toggle.ts#L52-L53>)); the desired direction can flip while the key is preserved (the retry-refetch reload path recomputes state), letting an opposite-direction toggle replay the cached earlier outcome and skip the server write.
4. **Feedback server guard (defense-in-depth layer only):** `assertReplayMatchesRequest` compares `questionId` plus payload but not `attemptId`/`practiceSessionId` ([`drizzle-question-feedback-repository.ts#L24-L43`](../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L24-L43)), so a reused key carrying the same question and payload from a different attempt/session context replays the old row and the new context's event is never recorded. The **client** fingerprint from BUG-295 does include both context fields, so this leg is a narrower backstop, not a primary hole.

## Reachability

Same trigger class as BUG-295: an outcome-indeterminate failure (client timeout on an uncanceled request that commits server-side, or the `cache-error-and-throw` arm) followed by a changed-intent retry on the same mount. PR #640's determinacy-aware preservation deliberately widened how long these keys live — which is correct — without binding them, which is the missing half. Submit and mark are everyday practice-flow actions; the interleaving needs no privileged state.

## Reproduction (submit leg)

1. In Tutor mode, select choice A and Submit; the request times out client-side at 15 s while the server commits and caches the graded result under key K (route budget 30 s; the promise is not canceled).
2. The error state leaves the question, selection, and Submit rendered; K is preserved (correct — the outcome was indeterminate).
3. The user selects choice B and clicks Submit. K travels with B.
4. `withIdempotency` finds K's completed outcome and replays A's grade without executing; the UI renders it as B's grade.

Expected: a changed selection is a new intent — mint a fresh key and execute; a same-selection retry replays.

Actual: silently wrong grade attribution (submit), phantom mark toggles (mark), skipped bookmark writes (bookmark).

## Root Cause

BUG-295's fix implemented fingerprint binding in the feedback helpers (`resolveRequestKey`/`mintRequestKey` in `question-feedback-actions.ts`) but the invariant was never swept across the other preserve-across-indeterminate surfaces the same wave created. The server-side feedback guard predates the fingerprint design and was scoped to what the original BUG-289 fix compared.

## Impact

Silent wrong-outcome presentation on core practice surfaces: a grade shown for the wrong choice, mark toggles that never wrote, bookmark toggles that never wrote. All bounded to the changed-intent-after-indeterminate-failure interleaving on one mount; remount mints fresh keys. P3, matching BUG-295's grade for the identical failure class.

## Proposed Fix

1. **RECOMMENDED:** extend the BUG-295 token pattern to the three client surfaces — fingerprint submit keys over `(questionId, selectedChoiceId)`, mark keys over `(questionId, desired mark state)`, bookmark keys over `(questionId, desiredBookmarked)` — reusing the shared `resolveRequestKey`/`mintRequestKey` helpers so the logic exists once. Reuse the preserved key only on a fingerprint match; mint fresh on any intent change.
2. Widen `assertReplayMatchesRequest` to compare `attemptId` and `practiceSessionId` (nullable-safe), keeping it defense in depth for the fenced-claim arm.
3. Pin each surface with a wrapper-boundary regression (real `withIdempotency` + `FakeIdempotencyKeyRepository`): same-intent retry replays without re-executing; changed intent executes fresh under a new key — the BUG-295 test shape, applied per surface.

## Resolution State (2026-07-14)

Implementation merged to `dev` through PR #647 (`b665d7ce`) and is awaiting production promotion after a final review follow-up on branch `fix/bug-298-request-identity-binding`. `Status` remains **Open** until production proof exists.

- Extracted BUG-295's fingerprint-bound key type and `resolveRequestKey`/`mintRequestKey` lifecycle into the neutral shared client module `app/(app)/app/shared/idempotency-request-key.ts`; feedback consumes the shared primitive with its existing fingerprints and behavior unchanged.
- Bound submit tokens to question, selected choice, active practice-session identity, and (for standalone reattempts) retry provenance; bound mark tokens to session, question, and desired mark state; bound bookmark tokens to question and desired state. Same-identity indeterminate failures preserve their key, changed intent mints fresh, and a consumed success retires the token.
- Added a standalone-submit in-flight fence after a browser red test exposed a lazy-mint double-submit race during self-review.
- Added per-question in-flight fences to both bookmark owners after review exposed that two synchronous toggles could launch the same claim before React committed the saving state; the guard precedes hydration-version mutation and releases when the request settles.
- Reused the neutral `mintRequestKey` primitive for both feedback success rotations after promotion review found the equivalent token construction had remained duplicated. A separate promotion-review claim that attempt reset needed another stale-submit fence was refuted by an unchanged browser reproduction: both reset paths already suppress the late transition result, while the existing owner fence prevents concurrent re-execution.
- Widened both the Drizzle feedback replay guard and its application fake to reject same-token replays whose nullable attempt or practice-session context differs.
- TDD coverage includes real-`withIdempotency` wrapper-boundary tests for all submit surfaces and bookmark, browser tests for mark plus the submit/bookmark in-flight fences, fake-repository contract tests, and real-Postgres replay-guard tests for both context fields. Red baselines reproduced stale changed-intent replay with one execution, duplicate launches before state commit, and the missing feedback conflicts before the implementation turned them green.

## Related

- [BUG-295 (archived)](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) — the invariant and the fix pattern; its Resolution notes these remaining surfaces.
- [BUG-290 (archived)](../_archive/bugs/bug-290-state-write-idempotency-caches-transient-internal-error.md) — established the determinacy-aware preservation on submit/mark that widened these keys' lifetimes.
- [BUG-289 (archived)](../_archive/bugs/bug-289-idempotency-caches-transient-errors-billing-bookmark-feedback.md) — the original feedback request-token design whose guard scope leg 4 widens.

Found during the 2026-07-14 wave-2 close adversarial regression review (8 finder lenses, 3-verifier panels per candidate).
