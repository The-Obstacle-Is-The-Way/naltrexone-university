# BUG-302: A Stale Report Completion Closes and Resets a Newer Report Dialog

**Status:** Open
**Severity:** P4
**Date:** 2026-07-16
**Confirmed:** 2026-07-16 (fix-wave-4 combined-diff adversarial review; confirmed 3/3 by source ownership tracing, a real Chromium component reproduction, and an idempotency-impact verifier)
**Component:** Question feedback / report dialog / asynchronous UI ownership

---

## Summary

BUG-301 correctly prevents an obsolete rating/report request from mutating the current idempotency-token slot. The visible report dialog has a separate asynchronous owner, however, and does not fence the `Promise<boolean>` returned by the hook. Closing the dialog while report A is pending resets the form and permits report B. When A later succeeds, its old `handleSubmit` continuation unconditionally calls `resetForm()` and `onOpenChange(false)`, closing B's dialog and erasing B's in-progress form while B is still running.

The vulnerable continuation is in [`question-report-dialog.tsx`](../../components/question/question-report-dialog.tsx):

```ts
const didSubmit = await submitReport(...);
// ...
resetForm();
onOpenChange(false);
```

`handleOpenChange(false)` also resets `isSubmitting`, so closing and reopening during A is an explicitly supported production path rather than a synthetic double-submit.

## Reproduction

1. Open **Give feedback**, enter report A, and submit it while its response remains pending.
2. Close the dialog with Escape or an outside interaction. The dialog resets and the trigger becomes available again.
3. Reopen the dialog, enter report B, and submit it while B remains pending.
4. Resolve A successfully.
5. A's stale continuation emits the success notification, resets B's form, and closes the currently open dialog.

A temporary Vitest Browser probe exercised the real `QuestionReportDialog` and `NotificationProvider`. The expected assertion that B's dialog remained visible failed after A's success; Chromium reported that no element with `role="dialog"` existed. This is independent of BUG-301's token fix: the generation-CAS slot rejects A's stale token mutation, but the boolean result has no corresponding UI-owner generation.

## Impact

The newer report's category/comment disappears from view and the user receives a success message for the older request while the newer request is still pending. A stale failure can likewise re-enable a newer submission and display an obsolete error. BUG-301's slot ownership and fingerprint binding still protect append-only persistence, so this finding does **not** reintroduce duplicate feedback rows or lose the newer idempotency key. The harm is recoverable form loss and misleading dialog state; P4 is appropriate.

## Root Cause

Request identity has two lifecycle owners on this surface:

- `usePracticeQuestionFeedback` owns the idempotency-token slot and now generation-fences it; and
- `QuestionReportDialog` owns form state, notifications, and open/close state, but treats every completion as current.

The first owner was fixed without propagating equivalent stale-completion authority to the second.

## Proposed Fix

1. Give each dialog submission an owner generation (or equivalent compare-and-set claim). Closing/resetting the dialog or launching a newer submission supersedes the prior claim.
2. After `await submitReport(...)`, commit notifications, `isSubmitting`, form resets, and `onOpenChange(false)` only while that submission still owns the dialog lifecycle.
3. Do not cancel or rotate the hook's preserved idempotency key when the dialog closes; BUG-291/301 determinacy remains authoritative.
4. Add Chromium sequences for stale success and stale failure across close/reopen, plus an ordinary single-submit control.

## Resolution State

Implementation is complete on
`fix/bug-302-report-dialog-stale-completion` as of 2026-07-17; Status remains
Open until wave-5 archival records production proof.

- `QuestionReportDialog` now owns a monotonically increasing submission
  generation. Starting a submission claims the current generation; closing or
  resetting the dialog advances it. Every post-`await` success, returned
  failure, and thrown-failure continuation verifies ownership before it may
  notify, change `isSubmitting`, reset form state, or close the dialog.
- The feedback hook, token-slot generation CAS, fingerprints, and idempotency
  key determinacy behavior are unchanged. The rating surface was audited and
  has no equivalent presentation continuation: it delegates synchronously to
  the already generation-fenced hook.
- Red-first Chromium proof reproduced three failures on the pre-fix component:
  stale success closed the reopened dialog, while stale returned and thrown
  failures re-enabled the newer submission. The same focused suite is green
  after the owner-generation fence, including the existing ordinary
  single-submit close/success-toast control.
- Exact-head review identified that the initial race matrix did not isolate
  close-only invalidation from a newer submission's generation claim. A
  mutation check with the close-generation increment removed failed on an
  obsolete third `onOpenChange` call; the restored fence passes the added
  close-only Chromium sequence. Dialog-removal assertions now use Browser Mode
  retryable locators rather than manual DOM polling.
- PR number, exact approved head, squash SHA, full-gate evidence, and promotion
  proof are delivery facts recorded after their respective steps; the wave-5
  close will replace this implementation-state note with the complete immutable
  chain.

## Related

- [BUG-301 (archived)](../_archive/bugs/bug-301-stale-feedback-completion-clobbers-newer-request-key.md) — correctly fences the token slot but does not own dialog presentation state.
- [BUG-295 (archived)](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) — establishes preservation and consumption rules for feedback keys.

Found during the 2026-07-16 fix-wave-4 close adversarial review of `ade71553...53ef2e2f`.
