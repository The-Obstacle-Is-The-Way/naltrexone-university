# DEBT-492: Release Safety Gaps to Close Before the Production Bootstrap

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open
**Priority:** P2
**Date:** 2026-10-03
**Resolved:** —
**Verification receipts:** —

---

## Summary

An adversarial review of the release system on 2026-10-03 (read-only, against `main` at `94b3b87a`) found four gaps. None is live: no production release exists, and staging, holds and activation act only on a database that has one. Each becomes live with the production bootstrap, so all four should be closed before it.

1. **Staging can make learners' session starts fail.** A stage holds a row lock on every existing question in its bundle until it commits. Starting a session takes a conflicting lock on those rows, and the app gives up after five seconds.
2. **A stale bundle silently reverts corrections.** Staging reuses any earlier revision whose content matches a file. Activation then moves the question back to that revision, so an answer-key correction can be undone. The preview lists the question under "Publish or move", which cannot tell a revert from an edit.
3. **A held question can return with new content unflagged.** A hold binds one revision. A release naming a newer revision of a held question publishes it, listed as an ordinary "Publish or move".
4. **`stage-release.ts` prints an activation command that activation refuses.** The command lacks `--reason` and `--authority`, which DEBT-490 made required. This was a miss in DEBT-490.

## Evidence

**1. The lock window.**
- `stageReleaseFromFiles` takes the release pointer, then locks every existing bundle question `FOR NO KEY UPDATE` and holds both until commit (`scripts/content-release/release-builder.ts`, the `existing` query).
- Session creation locks its question rows `FOR SHARE` in the query that binds each question's current revision (`src/adapters/repositories/drizzle-practice-session-repository.ts`, the create path). That conflicts with `FOR NO KEY UPDATE`.
- The app's `lock_timeout` is 5 s (`lib/db-connection-options.ts`). A stage of the roughly 950-file bundle against Neon makes several queries per file, so it can outlast that. The dry run takes the same locks, because it is the real transaction, rolled back.
- **Staging updates no question row learners read.** With `makeCurrent: false`, `appendQuestionRevision` inserts a revision and its choices and never updates `questions` (`scripts/seed/question-revision-writer.ts`, the `makeCurrent` branch). Tags are written to `question_tags` (`replaceQuestionTags`). Since BUG-314, every supported content writer serializes on the pointer, so the row locks protect nothing that the pointer does not already protect.

**2. Silent reverts.**
- `revisionForContent` matches a file to any earlier revision with the same `content_hash` (`release-builder.ts`).
- Activation then sets `current_revision_id` to the item's revision (`release-activation.ts`, the publish `UPDATE`).
- The plan names such a question under `changed`, printed as "Publish or move" (`command-support.ts`, `formatPlan`).
- Revisions carry `revision_number` (`db/schema.ts`, `question_revisions`), so a move to a lower number than the active release's item is detectable.
- A rollback restores earlier revisions by definition and is exempt from the completeness check. Its preview has the same blind spot.

**3. Held questions.**
- `HELD` excludes an item only when its own revision has an unlifted hold (`release-activation.ts`).
- A staged edit to a held question creates a new revision, which is eligible. Activation publishes it, and the plan lists it under "Publish or move", not under "Left out, held".

**4. The printed command.** `scripts/content-release/stage-release.ts` prints `activate-release.ts --release … --expect-active …`. `parseActivateArgs` refuses it: "--reason is required: why the activation" (`activate-release.ts`).

## Impact

- **Gap 1 affects learners directly:** session starts fail for the length of a stage.
- **Gaps 2 and 3 are clinical-safety gaps.** An operator could undo an answer-key correction, or return content under clinical review, without seeing that they had done so. The plan binding (DEBT-489) guarantees that what was reviewed is what is applied, but the review surface did not show these changes for what they are.
- **Gap 4 costs an operator a failed command.**

## Resolution

Red tests first for each.

1. **Staging takes only the pointer.** Drop the row locks on existing bundle questions.
   - Test: a session-start lock (`FOR SHARE` on bundle questions, with a short `lock_timeout`) succeeds while a stage is paused mid-transaction. Today it times out.
   - Keep the existing concurrency cases (BUG-314) green.
2. **A revert is explicit.**
   - Staging refuses a bundle that would move a member of the active release to an earlier revision (a lower `revision_number` than its active item), and names the questions. The operator restores the newer content, or names each with `--revert <qid>`.
   - Activation repeats the check for a release never active before (like `INCOMPLETE_RELEASE`). A rollback is exempt, but its preview names every revert.
   - The plan splits "Publish or move" into "Publish", "Update to a newer revision" and "Revert to an earlier revision". The plan id is unchanged, because it already binds every (question, revision) pair.
3. **A held question returning with new content is named.** The plan lists "Replaces a held revision" for any item whose question has an unlifted hold on another revision. The operator approves it knowingly, through the plan.
4. **The printed activation command includes `--reason "<why>" --authority "<who>"`.**

## Verification

- A session-start lock succeeds while a stage is in progress. Restoring the row lock fails that case.
- Staging refuses an unnamed revert and stages a named one. Activation refuses an unnamed revert in a new release and allows a rollback.
- The preview names reverts, updates and replaced held revisions separately.
- The command printed by `stage-release.ts` is accepted by `activate-release.ts`'s parser.
- Each refusal and each new plan line, when removed, fails a case.

## Related

- [DEBT-489](../_archive/debt/debt-489-release-removes-omitted-questions.md): explicit removals and the plan binding. This record is the same principle (no silent change) applied to revisions and holds.
- [DEBT-490](../_archive/debt/debt-490-release-decisions-record-no-reason-or-authority.md): attributed activations, whose printed command gap 4 fixes.
- [BUG-314](../_archive/bugs/bug-314-content-hold-withdrawal-deadlock.md): content writers serialize on the pointer.
- [`content-pipeline.md`, Releases](../practice-engine/content-pipeline.md#releases-bootstrap-stage-activate-roll-back-and-hold).
