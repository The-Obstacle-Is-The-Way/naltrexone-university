# BUG-301: A Stale Feedback Completion Can Clobber a Newer Preserved Request Key and Re-execute an Append-Only Write

**Status:** Open
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (fix-wave-3 combined-diff adversarial review; confirmed 3/3 by independent verification panels; rating and report interleavings reproduced through the production helpers)
**Component:** Question feedback / client idempotency-key ownership / append-only persistence

---

## Summary

BUG-295 and BUG-298 bind each preserved feedback key to the request identity it represents. They do not protect the **owner slot** from an obsolete asynchronous completion. Rating and report tokens live in maps keyed only by `questionId` ([`use-practice-question-feedback.ts#L60-L65`](<../../app/(app)/app/practice/hooks/use-practice-question-feedback.ts#L60-L65>)). Visible rating/status updates are fenced by `feedbackStateVersionRef`, but the token setters unconditionally call `Map.set(questionId, token)` ([rating lines 151-166](<../../app/(app)/app/practice/hooks/use-practice-question-feedback.ts#L151-L166>), [report lines 196-201](<../../app/(app)/app/practice/hooks/use-practice-question-feedback.ts#L196-L201>)).

Every post-await token transition in the shared helper — automatic reused-token retry, determinate-error rotation, and consumed-success rotation — uses that blind setter ([rating](<../../app/(app)/app/shared/question-feedback-actions.ts#L140-L180>), [report](<../../app/(app)/app/shared/question-feedback-actions.ts#L243-L285>)). An older request can therefore overwrite the only key for a newer, possibly committed request after the UI context has moved on.

## Reachability

This is not the previously refuted same-screen double-click claim. The production UI allows the owner context to advance while feedback remains in flight:

- On the standalone question page, Reattempt is disabled only by answer-submit pending state, not feedback saving ([`question-page-client.tsx#L429-L439`](<../../app/(app)/app/questions/[slug]/question-page-client.tsx#L429-L439>)). Reattempt resets the answer in the same mounted page model, and the next submission changes the feedback `attemptId` while the same hook and question-keyed maps survive.
- Practice navigation likewise is not owned by `feedbackStatus`, so a user can leave and later revisit the same question while the hook remains mounted.
- The report dialog does not prevent Escape/outside close during submission; its close handler resets local submission state while the awaited request continues, permitting a later edited/new report in a changed context.

The newer request's indeterminate failure need not wait for the same 15-second timeout as the older request. A transport/lost-response failure can occur immediately after the server commits B; the client must retain K-B because commit state is unknown. Older A can then complete normally before its own deadline and overwrite K-B.

## Reproduction

1. Start feedback request A for question Q / attempt A under K-A; leave its response pending.
2. Reattempt or navigate away/back, producing attempt/context B on the same mounted owner. Start feedback request B; fingerprint binding correctly mints and stores K-B.
3. B commits its append-only row, but its response is lost. The thrown/transport arm correctly preserves K-B.
4. A then completes successfully. Its consumed-success arm blindly stores a freshly retired A-bound token K-A2 into Q's map slot, overwriting K-B.
5. Retry B. `resolveRequestKey` sees A's fingerprint, correctly mints K-B2, and executes B again instead of replaying K-B.
6. The feedback repository's uniqueness constraint is only `(userId, kind, idempotencyKey)` ([`schema.ts#L728-L730`](../../db/schema.ts#L728-L730)); K-B2 inserts a second append-only rating/report row.

A no-edit tracer through the production rating helper observed action keys `K_A`, `K_B`, `K_B2`: after B's indeterminate failure the owner held K-B, stale A completion replaced it with A's fingerprint, and B retry executed under K-B2. Independent probes reproduced the same ownership loss for report.

Expected: once B owns the slot, no completion from A can replace B's preserved key.

Actual: UI state is generation-fenced, but idempotency-token state is last-completion-wins.

## Impact

The only handle to a possibly committed feedback write can be lost, allowing a deliberate retry to append the same logical rating or report again under a fresh key. Duplicate reports are user/editor-visible data-integrity noise; duplicate ratings inflate the append-only event history. The race requires an in-flight context change plus an indeterminate newer response, but uses ordinary UI paths and no privileged state. P3 is appropriate.

## Root Cause

Identity binding answers “does this token describe this request?” It does not answer “is this asynchronous request still authorized to mutate the owner's current token?” BUG-298 extracted a correct neutral key primitive, while the owning hook retained blind setters and fenced only presentation state. The missing mechanism is request-generation or compare-and-set ownership at the lifecycle owner.

## Proposed Fix

1. Give each rating/report invocation an owner generation (or an equivalent compare-and-set token fence) captured before launch. Every token mutation after an await — including reused-token retry, determinate-error rotation, and success rotation — may commit only if that invocation still owns the slot.
2. Preserve K-B after B's indeterminate failure. Do not solve the race by rotating on thrown/timeout outcomes or by disabling navigation indefinitely; both would violate the determinacy rule or couple unrelated UI ownership.
3. Cover rating and report with browser tests using deferred A/B responses across reattempt/navigation/dialog close. Add a real-`withIdempotency` + fake-repository boundary test proving B executes once when its original key is preserved and twice under the pre-fix clobber sequence.

## Resolution State

Implementation completed on `fix/bug-301-feedback-token-ownership` on 2026-07-15; PR review, promotion, and production proof remain pending. The neutral `idempotency-request-key.ts` module now owns a reusable generation-fenced request-key slot: each invocation claims the slot, current-generation retry/success/error transitions remain writable, and a superseded invocation's token writes are ignored. `usePracticeQuestionFeedback` applies that owner claim to both rating and report before launching the shared helpers, covering the practice question flow, practice-session page model, and standalone question page through their existing shared hook.

Red-first coverage reproduces both stale-completion failures in Chromium (reattempted rating and edited report after dialog close), pins the slot's compare-and-set contract, and exercises the lost-response interleaving through real `withIdempotency`, `RateQuestionUseCase`, and `FakeQuestionFeedbackRepository`; the newer key replays without a duplicate append-only write. Existing control tests continue to pin consumed-success rotation, determinate-error rotation, and the helper's same-generation reused-token retry. No server or schema changes are part of this fix. Status remains **Open** until wave-close archival after production proof.

## Related

- [BUG-295 (archived)](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) — established fingerprint-bound preservation and retirement for feedback tokens.
- [BUG-298 (archived)](../_archive/bugs/bug-298-preserved-keys-unbound-on-submit-mark-bookmark-surfaces.md) — completed identity binding across sibling surfaces and extracted the neutral key primitive; this finding is the distinct asynchronous ownership gap.
- [BUG-289 (archived)](../_archive/bugs/bug-289-idempotency-caches-transient-errors-billing-bookmark-feedback.md) — owns feedback's determinacy-aware server policy and request-token persistence mechanism.

Found during the 2026-07-14 fix-wave-3 close adversarial regression review of `ba457afd...76de5ba3` (independent finder lenses and a 3-verifier panel).
