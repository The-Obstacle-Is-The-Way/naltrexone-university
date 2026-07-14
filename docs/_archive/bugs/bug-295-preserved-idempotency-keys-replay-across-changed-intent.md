# BUG-295: Preserved Idempotency Keys Replay Committed Outcomes Across Changed Request Intent

**Status:** Resolved
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (post-merge adversarial review of PR #640; both legs validated from first principles against the merged code, feedback leg additionally reproduced by an independent tracer — second request `not_helpful` returned the cached `helpful` with `executions: 1`)
**Component:** idempotency client key lifecycle (question feedback, practice recovery panel)

---

## Resolution (2026-07-14)

Fixed in [PR #642](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/642) (squash `980a9bd4` to dev; CodeRabbit formal APPROVED review object on the exact final head `f022ce5d`), promoted via PR #643 (main `cde6ccd8`, main/dev trees byte-identical); main CI succeeded and `https://addictionboards.com/` returned HTTP/2 200. All three legs of the Fix section shipped: `FeedbackRequestToken { key, fingerprint }` minted on any intent change, with the key-lifecycle logic extracted into shared `resolveRequestKey`/`mintRequestKey` helpers at CodeRabbit's review, and a wrapper-boundary regression (real `withIdempotency` + `FakeIdempotencyKeyRepository`) pinning same-intent replay without re-execution against changed-intent fresh execution; a session-scoped `AbandonRequestToken` resolved **synchronously from a ref** — a state-resolved token opened a double-click double-mint race caught in self-review, now pinned in the browser suite — and rotated on consumed success; and start-key retirement composed at the controls layer, with the full start → recovery → abandon → start-again sequence pinned in `use-practice-session-controls.browser.spec.tsx`.

Residuals filed from the wave-2 close review: this doc's invariant was implemented for the feedback tokens and the local abandon-success arm only — [BUG-298](../../bugs/bug-298-preserved-keys-unbound-on-submit-mark-bookmark-surfaces.md) covers the unswept sibling surfaces (submit-answer choice binding, mark-for-review, bookmark direction, and the server guard's missing attempt/session context fields), and [BUG-299](../../bugs/bug-299-recovery-panel-external-resolution-stale-state-dead-ends.md) covers recovery-panel resolutions that bypass the local abandon-success arm (terminal lifecycle conflicts, second-tab resolution) and therefore never refresh the panel or retire the start key.

## Summary

PR #640 (BUG-289/290/291) correctly taught clients to **preserve** idempotency keys across outcome-indeterminate failures — the preserved key is the only handle to a possibly-committed result. But preservation shipped without the other half of the invariant: **a preserved key must be bound to the request identity it was minted for, and retired once its outcome is consumed by another surface.** Two legs violate it.

`withIdempotency` returns a completed cached outcome **before** `execute()` runs ([`with-idempotency.ts#L328-L343`](../../../src/adapters/shared/with-idempotency.ts#L328-L343)). Any guard that lives inside `execute()` — including PR #640's repository-level `feedback_request_token_reused` check — therefore protects only the fenced-claim arm (feedback row committed, wrapper outcome missing). On the normal committed-and-cached replay path, nothing compares the incoming request to the one that produced the cached outcome.

## Leg 1 — Feedback: changed vote / edited report silently replaced

The client stores rating/report keys **per question**, not per request ([`use-practice-question-feedback.ts#L59-L60`](<../../../app/(app)/app/practice/hooks/use-practice-question-feedback.ts#L59-L60>)). Keys rotate on success and on determinate cached errors, and re-key once on the typed reused-token conflict — but a key preserved across a thrown/indeterminate outcome is reused verbatim for whatever the user asks next.

Interleaving:

1. User rates `helpful`; the server commits the row and caches success under key K; the response is lost to the client 15s timeout (the server action is not canceled and completes within the 30s route budget).
2. The client correctly preserves K (indeterminate outcome).
3. User changes the vote to `not_helpful`. The same K travels with the new payload.
4. The wrapper finds K's completed outcome and replays `{ rating: 'helpful' }` without executing. The repository guard never runs. The UI flips back to `helpful` marked "saved".

The user's changed vote is silently dropped. The edited-report variant is worse: `submitReportForQuestion` returns `true`, so the user is told their edited report was submitted when it never left the wrapper. This is exactly the silent-replacement failure BUG-289's resolution note claimed was closed; that note has been amended to scope the guard to the fenced-claim arm.

## Leg 2 — Recovery lifecycle: abandon/start keys never retired

The abandon key is a single mount-scoped UUID, not bound to the session it targets, and not rotated when its success outcome is consumed ([`use-practice-incomplete-session.ts#L41-L43`](<../../../app/(app)/app/practice/hooks/use-practice-incomplete-session.ts#L41-L43>), success path [`practice-page-incomplete-session.ts#L172-L173`](<../../../app/(app)/app/practice/practice-page-incomplete-session.ts#L172-L173>)). The start key rotates on every config change but nothing retires it when the recovery session is resolved by abandonment ([`use-practice-session-controls.ts#L69-L70`](<../../../app/(app)/app/practice/hooks/use-practice-session-controls.ts#L69-L70>)).

Compound interleaving (all within one mount, using only the recovery flow PR #640 built):

1. Start session A hits the `cache-error-and-throw` arm — A committed, outcome store failed, `INTERNAL_ERROR` cached under start key S. S is preserved (correct: not a determinate code) and the refresh-on-failure surfaces A's Resume/Abandon panel.
2. User abandons A. Success is cached under abandon key B1; the panel clears. Neither S nor B1 is retired.
3. User clicks Start again with the same config. S replays the cached `INTERNAL_ERROR`; the refresh now finds nothing to recover (A is ended). Every further click replays the same error with no recovery surface — **BUG-291's dead-end, recreated through the recovery path itself.** (The variant where A's start success was cached but the response was lost instead replays `{ sessionId: A }` and navigates the user into the session they just abandoned.)
4. Independently: if a later incomplete session B surfaces on the same mount (start-B failure → refresh), Abandon B travels under B1, and the wrapper replays **A's** cached abandon success — the panel clears, B never ends, and the next start conflicts on B forever.

## Impact

Silent user-intent drop on the feedback surface (changed vote / edited report reported as saved), and a same-mount practice-start dead-end recoverable only by reload. Severity P3, matching BUG-289/291: no money path, no data loss, remount recovers, but the failure is silent and the dead-end lands on the surface the wave-2 fix was hardening.

## Fix (implemented with this filing)

1. **Feedback:** bind the stored key to a request fingerprint (`FeedbackRequestToken { key, fingerprint }` over question, attempt, session context, and payload). Reuse the preserved key only when the outgoing request matches the fingerprint it was minted for; mint fresh on any intent change. The repository's typed reused-token conflict stays as defense in depth for the fenced-claim arm. A wrapper-boundary regression (real `withIdempotency` + `FakeIdempotencyKeyRepository`) pins both directions: same-intent retry replays the committed outcome without re-executing; changed intent executes fresh under a new key.
2. **Abandon:** scope the token to its target session (`{ sessionId, key }`; mint fresh when the panel's session differs) and rotate on consumed success.
3. **Start:** retire the preserved start key when the recovery session is successfully abandoned, composed at the controls layer where both hooks meet. The start → recovery → abandon → start-again sequence is pinned in the browser suite.

## Related

- [BUG-289](./bug-289-idempotency-caches-transient-errors-billing-bookmark-feedback.md) — its repository-level request-identity guard is necessary but only reaches the fenced-claim arm; resolution note amended.
- [BUG-291](./bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — the dead-end this doc's Leg 2 recreates via the recovery flow; resolution note amended.
- [DEBT-456](../../debt/debt-456-client-conflict-reason-discrimination-gaps.md) — client conflict-reason discrimination gaps; the reused-token conflict consumer list grows with this fix.
- PR #640 — the wave-2 idempotency PR whose preservation rules this filing completes.
