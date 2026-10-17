# BUG-351: The Production Seed Can Silently Restore a Corrected Answer Key, and the Release Builder's Guard Misses Part of the Same Case

**Status:** Open — fix designed, not built. Owner checks production's live answer keys against the content repository by 2026-10-24; until the fix, refresh drafts from its `main` before any production seed
**Priority:** P2
**Date:** 2026-10-17

---

## Summary

A production seed run from an out-of-date copy of the questions puts a corrected answer key back live, with no warning. The release builder, which production will use after the bootstrap (DEBT-483), refuses only part of the same case. It also refuses the correct content after a repair. So the bootstrap alone does not fix this.

Reproduced on 2026-10-17 on a disposable local database, with the public placeholder question:
- **1–2. Seed and correct.** Seed key A, then the corrected key B: R1 (key A), then R2 (key B), live.
- **3. Stale seed.** Seed the stale file again. The seed prints `updated=1 (new revisions=1)` and puts R3 (key A) live. Nothing warns or refuses.
- **4. Repair.** Seed the correction again: R4 (key B), live.
- **5. Bootstrap.** Bootstrap a release from what is live.
- **6. Correct content refused.** Stage the correct, unchanged content (key B). The builder refuses it as a move "back to an earlier revision". Its unordered `.limit(1)` returned R2, not the live R4, on every run.
  - Naming it with `--revert` stages R2, so activation would move the live revision from R4 to the identical R2. Learners who answered R4 would then see a spurious "updated" notice.
- **7. Exact stale copy refused.** Stage the stale file exactly as once stored: refused, as designed.
- **8. Edited stale copy accepted.** Stage a stale file with key A and one unrelated edit. The builder stages it as a new revision, and the activation preview lists it under "Update to a newer revision (1)".

**The cause, from first principles.**
- **No version comes with the input.** The content repository is the source of truth, but production is written from a copy on the operator's disk. That copy carries no version, so no writer can tell older content from newer.
- **Both writers can test only equality.** The seed compares the file with the live revision only, so any difference wins: last-writer-wins, with the operator's disk as the writer.
- **The builder sees only stored revisions.** It also asks whether the file equals a stored revision, so a stale key with any other change passes.
- **Append-only revisions keep a record, not a guard.** They record R3; they do not prevent it.

**What learners see while the stale key is live.** ADR-022 Decision 4 judges every answer against the live key, so the regression inverts it:
- **Correct answers are disowned.**
  - Learners who answered the correction (R2) are told "The answer to this question was corrected after you answered". Their attempt is shown ungraded, and the Incorrect filter re-offers the question.
  - The "Practice the corrected question" link opens the stale key.
- **Open sessions turn on correct learners.** In sessions bound to R2, tutor feedback reads "Not scored". It labels the correct answer "Answer before the correction" and withholds its explanation.
- **Old wrong grades count again.** Answers graded on the original wrong key (R1) count again, and learners who chose that key drop out of the Incorrect filter.
- **New answers are taught the wrong key.** They are graded on it, and its explanation teaches it.

**What a repair leaves behind.** Seeding the correction again (R4) restores R2's learners, as Decision 4 designs.
- **The window's answers stay on R3.** They are excluded from scores, with the "corrected" notice.
- **Window sessions take the corrected path.** Sessions bound to R3 show their items "Not scored", label the stale key "Answer before the correction", and withhold its explanation. Tutor sessions have no deadline, so this can last indefinitely.
- **What learners were taught in the window cannot be undone.**
- **The history now blocks the builder.** The A→B→A→B history makes it refuse the correct content (step 6). That teaches the operator to pass `--revert` routinely, which defeats the guard.

## Evidence

**The seed:**
- `scripts/seed/question-syncer.ts:257-266` compares the file with the current revision only, and appends a revision when they differ. `question-revision-writer.ts:77` makes it current at once.
- The report is counts only (`scripts/seed/seed-summary.ts`).
- `pnpm db:seed:prod -- --plan` prints only the target database (`scripts/seed-environment-targets.ts:100-103`). There is no content preview.
- The production seed imports `content/drafts/questions` with `--status published` (`scripts/prepare-seed-corpus.ts:24`, `scripts/import-draft-questions.ts:20`). That folder is untracked, and a manual copy refreshes it.
- `pnpm db:seed` with an acknowledged production URL seeds `content/questions/imported` as it stands, without importing.
- Each question is its own transaction, so a refusal partway through a run leaves the earlier questions written.
- Nothing else writes production content: CI seeds placeholders into its own database, the Vercel build only migrates, and `db:seed:all` excludes production.

**The builder:**
- `scripts/content-release/release-builder.ts:57-78`: `revisionForContent` matches a file to a revision by stored hash, `.limit(1)` with no order (`:76`), and nothing makes `(question, content_hash)` unique.
- `revertedSlugs` (`:300-321`) calls a match a revert when its revision number is below the current one.
- A file that matches no revision is appended as new content. `scripts/content-release/command-support.ts:80-92` prints it under "Update to a newer revision"; no plan line names an answer-key change.

**The scoring side:**
- `src/domain/services/answer-key.ts:22-28` and `src/adapters/repositories/shared/score-eligibility-sql.ts:95-139` compare each attempt's key with the live revision's key, not with history.
- `components/question/question-update-notice.tsx`, `components/question/ungraded-review.ts` and `components/question/feedback-ungraded.tsx:138-143` hold the notices, the labels and the withheld explanation.
- `src/adapters/repositories/drizzle-practice-session-repository.ts:624-639`: a session binds each question's revision when it starts.

**The documents:** `docs/architecture/content-pipeline.md:54-56,63,87` says drafts never reach production ("It never touches `content/drafts/`"; "Nothing reads from here automatically"). The production seed reads them.

**Exposure**, measured read-only on 2026-10-17 by parsing answer keys and printing counts only:
- **Today's copies.** Every clone's drafts equal the content repository at `690ecf2`, a 2026-03-31 commit on its development line. HEAD (`f74cb62`) differs from that in one question, not in its key. Every clone's `content/questions/imported` agrees with HEAD on all 948 keys. A production seed today would restore no key.
- **The content repository's two lines disagreed for six months.**
  - Its `main` stayed at `e94ac0d` (2026-03-28) until the merge `bbb454d` on 2026-09-20.
  - That tree differs from HEAD in 165 questions under ADR-022's key definition, 93 of them with a different correct letter. These are rewrites: nearly every one also changed its stem and explanation. Whether any older key is clinically wrong is unmeasured.
  - So a copy taken from `main` in that period carried 165 older keys.
- **Revision history is short.** Revisions exist since migration 0039 (2026-09-28), and the seed has appended instead of overwriting only since `3ac01fc8` (2026-09-30). Which key set production received, and in what order, before then is unrecorded.
- **One backup per clone parses.** Each clone keeps five backup folders in `content/drafts/` (20 in all).
  - The four from 2026-03-05 to 2026-03-28 fail today's importer.
  - `questions-backup-20260331` equals `e94ac0d` and passes the importer. Restored as the drafts folder, it would publish those 165 older keys.

**History:**
- DEBT-446 (closed): parked the seed's freshness check until a second writer appeared. Its Waiting row's gap is this defect.
- DEBT-492: added the builder's revert refusal, judging that no other writer was live.
- DEBT-531: the two writers' different rules. This record takes the live defect, and its fix is DEBT-531's first piece.

## Impact

A board-preparation bank that teaches a wrong answer harms the people relying on it. This one would also tell learners who answered correctly that they were wrong. Nothing automatic stops it; only operator discipline does.

No copy restores a key today. The exposure returns with the next answer-key correction, a copy from the wrong line or commit, or a restored backup. Whether production already holds an older key set is unknown until the owner's check.

P2: high harm, an operator-triggered path with no guard and no warning, and no current exposure in the copies.

## Options

1. **Make content move only forward along the source's history, guard answer keys separately, and plan before applying.** *Recommended.* Both writers call one planner. The design is below; nothing is built.
2. **The same planner in the builder only.** Bootstrap, then make the seed refuse production outright. Choose this if the owner schedules the bootstrap before the fix ships; it skips plan-then-apply for a path the bootstrap retires.
3. **Bootstrap alone (DEBT-483).** This does not fix the bug: the builder accepts step 8 and refuses step 6.
4. **Process only:**
   - refresh drafts from the content repository's `main` before every production seed;
   - move the 2026-03-31 backups out of `content/drafts/`.

   Do these now as mitigations. They depend on memory, and the next copy or agent repeats the mistake.

### The fix (option 1, designed, not built)

**The invariant:** production content moves only forward along the content repository's `main`. An answer key that a later live revision replaced never returns without a named revert, whatever the source.

Each layer closes a gap the others leave:
- **Provenance** stops a stale copy, whether or not its key was ever stored. It cannot stop a regression made in the source itself, such as a bad merge.
- **The key rule** stops that second case, but sees only keys this database stored.
- **The plan** puts every remaining key change in front of a person. A wrong but new key needs human judgment, because no rule can tell it from a real correction.

**1. Read the source, not a copy.**
- **The input.** Production content comes from a named commit on the content repository's `main`, read from git (`git archive`), not from the untracked drafts folder. The drafts folder stays an authoring workspace for local use only.
- **The checks.**
  - The writer refuses a commit outside `main`'s first-parent line.
  - Production records the last commit it applied, and the writer refuses a commit that does not descend from it, unless that is a named revert.
  - The record and the check sit in the same transaction, under the release-pointer lock.
  - `main`'s first-parent line is a total order, so "newer" is well defined, and the development-line divergence above cannot recur.
- **Precedent.** This is the provenance discipline of a deployment pipeline: deploy only what was built from a known commit (Humble and Farley's *Continuous Delivery*). It works like a fencing token (Kleppmann, *Designing Data-Intensive Applications*, ch. 8): the store holds the last marker, and a stale writer is turned away.
- **Interfaces.** The cross-repository release interface (the content repository's SPEC-007, behind ADR-021) records the commit. ADR-021 is amended.

**2. One planner, two thin writers.**
- **What it does.** A pure function classifies each incoming question against that question's history:
  - **insert;**
  - **unchanged:** equal to the live revision;
  - **forward:** new content;
  - **revert:** equal to an earlier live revision;
  - **key regression:** an answer key that a later live revision replaced;
  - **conflict:** reactivating an archived or withdrawn question.
- **The seed and the builder become adapters over it,** so they cannot disagree again. That is DEBT-531's single planner, built first for the rule that harms learners.
- **Live revisions only.** A revision counts as live if the seed wrote it (every seed revision went live, and the seed refuses once a release is active) or an activated release names it. Staged revisions that never went live do not count, so they cannot make a real correction look like a regression.
- **The key comparison** uses ADR-022's key fields, each correct choice's label and text, canonicalized the way the seed canonicalizes content. A stale key whose only stored copy is a legacy, non-canonical first revision still matches. Scoring keeps its raw comparison; DEBT-531 owns that difference.
- **Content equality** is decided on canonical fields recomputed from the stored rows, not the stored hash, which DEBT-531 notes may not be canonical.
- **The live revision wins a tie.** Equal to the live revision means unchanged, even when an older revision is also equal. This fixes step 6 and removes the unordered `.limit(1)`.
- **Deliberate returns are named reverts.** A repair after a regression, and a deliberate return to an earlier key, both go through a named revert with a reason and authority, recorded as an activation's are (DEBT-490).

**3. Plan, then apply, for every writer.**
- **The plan.** Each writer prints a per-question plan naming every revert, key regression, conflict and forward change that changes the answer key. A key change is never folded into a count.
- **The plan id binds the inputs:** the source commit and every input file's hash. An apply runs only the plan an operator reviewed. Activation already works this way (DEBT-489).
- **Refusals happen before any write.** Every refusal is found in the planning pass, so a refused plan writes nothing.
- **Optimistic concurrency at apply.** The plan records each question's live revision. Each per-question transaction re-checks it after taking the release-pointer lock, and stops if it moved. This is Fowler's Optimistic Offline Lock, or compare-and-set (Kleppmann, ch. 7, "Preventing Lost Updates").
  - A stop leaves the earlier questions applied. Running the same plan again skips them as unchanged and continues, so an apply is resumable rather than atomic. One transaction over every question would hold row locks that block learners' session starts (DEBT-492).

**4. Correct the content pipeline document.**
- Say that the production seed reads the drafts, until part 1 retires that path.
- Name the content repository's `main` as the source.
- Say what the plan shows.

**Red first:**
- Seed A, B, then A: refused as a key regression naming the question, with no revision appended and nothing else written.
- The same with a named revert, reason and authority: appended, and the decision recorded. A repair after a regression goes the same way.
- A seed from a commit that does not descend from the last applied commit is refused, and so is a commit off `main`'s first-parent line.
- A seed whose content equals an earlier live revision, with no key change, is refused as a revert.
- Builder after A→B→A→B: the correct content is unchanged, not a revert (step 6).
- Builder with a stale key never stored verbatim: refused as a key regression (step 8).
- A revision that was staged but never live does not make a later forward change a regression.
- One table of cases runs through both writers, and they classify every case identically.
- An apply refuses when a question's live revision moved after the preview, and a rerun of the same plan completes the rest.

## Resolution (proposed)

**Now, for the owner** (no code):
- **By 2026-10-24,** compare production's live answer keys with the content repository's HEAD, in a read-only transaction, printing counts only. This is the decisive check: the bootstrap adopts whatever is live, and history before 2026-09-30 was overwritten.
- Run the query under Verification once, as a second check.
- Before any production seed, refresh `content/drafts/questions` from the content repository's `main`.
- Move each clone's `questions-backup-20260331` out of `content/drafts/`. Engineering does not delete them; they are not its work.

**Next, engineering:** parts 2–4 of option 1, red first, in one change. Then part 1, with ADR-021's amendment and the content repository's SPEC-007 change. If the owner schedules the bootstrap first, use option 2's split instead.

## Verification

- [ ] The owner's comparison of production's live answer keys with the content repository's HEAD is recorded here as counts. Any mismatch becomes its own record before the bootstrap.
- [ ] A seed of a stale key, or of an earlier live revision, is refused before any write. A named revert records its reason and authority.
- [ ] A seed from a commit that does not descend from the last applied one is refused.
- [ ] The builder treats content equal to the live revision as unchanged after an A→B→A→B history, and refuses a stale key never stored verbatim.
- [ ] Both writers classify one shared case table identically.
- [ ] Each writer prints a per-question plan naming every key change, and applies only a reviewed plan id.
- [ ] `docs/architecture/content-pipeline.md` says what the production seed reads, and names the content repository's `main` as the source.
- [ ] The owner has run this query on production once. It lists revisions whose answer key returned to an earlier one after a change.
  - It sees only history since 2026-09-28, and it counts repairs too. Read each hit with its revision's date and the attempts graded on it.
  - The probe's history (regression, repair, staged copy) returns 3, 1, 1, 0.

  ```sql
  begin transaction read only;
  with keyed as (
    select r.id, r.question_id, r.revision_number,
      string_agg(c.label || chr(31) || c.text_md, chr(30) order by c.label, c.text_md) as answer_key
    from question_revisions r
    join choices c on c.question_revision_id = r.id and c.is_correct
    group by r.id, r.question_id, r.revision_number
  ), stepped as (
    select *, lag(answer_key) over (partition by question_id order by revision_number) as previous_key
    from keyed
  ), returned as (
    select s.id, s.question_id from stepped s
    where s.previous_key <> s.answer_key
      and exists (
        select 1 from keyed k
        where k.question_id = s.question_id
          and k.revision_number < s.revision_number
          and k.answer_key = s.answer_key
      )
  )
  select
    (select count(*) from returned) as returned_revisions,
    (select count(distinct question_id) from returned) as questions,
    (select count(*) from returned join questions q on q.current_revision_id = returned.id) as live_now,
    (select count(*) from attempts a where a.question_revision_id in (select id from returned)) as attempts_graded_on_them;
  rollback;
  ```

## Related

- DEBT-531: the two content writers' different rules; this record's planner is its first piece.
- DEBT-483 (Waiting): the production content bootstrap, which waits for the owner's live-key check.
- DEBT-446 and DEBT-492 (closed): the parked freshness check, and the builder's revert refusal.
- ADR-021 and ADR-022 Decision 4: revisions, releases and key correction.
