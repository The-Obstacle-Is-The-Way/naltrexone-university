# DEBT-492: Release Safety Gaps to Close Before the Production Bootstrap

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-03. Staging takes only the pointer; a revert must be named, and the plan names it; a question that replaces a held revision is named; and the printed activation command carries the decision. The fix was promoted and release-verified, and its suites were re-run on `main`'s code before archival.
**Priority:** P2
**Date:** 2026-10-03
**Resolved:** 2026-10-03
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-03-utc)

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

## Fix — 2026-10-03

Each gap was closed red first.

1. **Staging takes only the pointer.**
   - `stageReleaseFromFiles` no longer locks the bundle's question rows. Its remaining writes to existing questions are revisions, choices and tags, whose foreign keys take only `FOR KEY SHARE`, which a session start's `FOR SHARE` does not conflict with.
   - The new reader-lock case pauses a stage mid-transaction, after every lock it takes, and starts a real learner session on the bundle's questions with a 2-second lock timeout. Before the fix, the session start timed out with `canceling statement due to lock timeout`; now it completes while the stage is still paused. The BUG-314 concurrency cases stay green.
2. **A revert is named.**
   - Staging refuses a published file whose revision is older than its question's current one, naming each such question. `--revert <qid>` allows it, and staging refuses a `--revert` for a question the bundle does not move back.
   - The plan replaces "Publish or move" with three lines: "Publish" (not live now), "Update to a newer revision" and "Revert to an earlier revision". A revert is a lower revision number than the question's current one, whatever its status, so a held or rolled-back question is named too. A rollback is not refused, but its plan names each revert.
   - **Activation does not repeat the check, a change from the Resolution above.** A release never active before must be built on the active release (`STALE_RELEASE`), and only staging creates releases. So the revisions a release names, relative to what is live, are those staging checked. The manifest would also have to record which reverts were named, a format change that adds no protection. The bound plan, which now names every revert, is the remaining safeguard.
3. **"Replaces a held revision".** The plan lists an item whose question has an unlifted hold on another revision. It is listed only while the release changes that question, so a dormant hold on a superseded revision is not named again.
4. **The printed command** includes `--reason "<why>" --authority "<who>"`. A case parses it with `activate-release.ts`'s parser.

**Evidence.**
- `content-release-reverts` holds gaps 2 and 3's eleven cases. Gap 1's case is in `content-release-reader-locks`, and gap 4's in `content-release-builder`.
- Eleven targeted mutations each fail a case:
  - the restored row lock;
  - the unnamed-revert refusal and the named-revert validation;
  - `<` widened to `<=`;
  - the order of the revert and publish branches;
  - the replaced-hold revision comparison, its unlifted condition and its changed-only filter;
  - the revert line's label;
  - `--revert` passed through the stage command;
  - the printed decision flags.
- The first mutation run left the branch order and the unlifted condition alive. Two cases were added (a revert of a held question, and a lifted hold on another revision), and both mutants now fail.

## Verification

- A session-start lock succeeds while a stage is in progress. Restoring the row lock fails that case.
- Staging refuses an unnamed revert and stages a named one. A rollback is allowed and its plan names each revert. (Activation does not repeat the check; see Fix.)
- The preview names reverts, updates and replaced held revisions separately.
- The command printed by `stage-release.ts` is accepted by `activate-release.ts`'s parser.
- Each refusal and each new plan line, when removed, fails a case.

## Verified closeout — 2026-10-03 UTC

- **Merged.** #1332 (CodeRabbit **5399706589** on `46e33282`; merged `0c13db5f`).
- **Released** through promotion #1337 (`c8104a36`), which also carried #1333, #1334 and #1336:
  - main CI **37115406018**, `test` passed **10:18:42Z**;
  - production assigned **10:18:44.050Z**;
  - `main` and `dev` trees `b40af874`;
  - production health 200 (`{"ok":true,"db":true}`).
- **An earlier promotion, #1335, was closed unmerged.** Its CI failed on a race in a test written for DEBT-493 (#1333), not on this record's work. #1336 fixed the test.
- **Re-verified** on `main`'s code before archival: `scripts/content-release/` and its suites are identical on `main`, and the integration lane passes (689, 12 skipped), including `content-release-reverts`, `content-release-reader-locks` and `content-release-builder`.
- **Not live until the bootstrap.** No production release exists yet, so these protections act from the owner's bootstrap on. The bootstrap no longer waits on this record.

## Related

- [DEBT-489](./debt-489-release-removes-omitted-questions.md): explicit removals and the plan binding. This record is the same principle (no silent change) applied to revisions and holds.
- [DEBT-490](./debt-490-release-decisions-record-no-reason-or-authority.md): attributed activations, whose printed command gap 4 fixes.
- [BUG-314](../bugs/bug-314-content-hold-withdrawal-deadlock.md): content writers serialize on the pointer.
- [`content-pipeline.md`, Releases](../../practice-engine/content-pipeline.md#releases-bootstrap-stage-activate-roll-back-and-hold).
