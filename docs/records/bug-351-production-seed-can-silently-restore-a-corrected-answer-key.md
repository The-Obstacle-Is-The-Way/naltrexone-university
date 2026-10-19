# BUG-351: The Production Seed Can Silently Restore a Corrected Answer Key, and the Release Builder's Guard Misses Part of the Same Case

**Status:** In Progress — live matching and named key returns built; source admission remains; owner live-key check due 2026-10-24
**Priority:** P2
**Date:** 2026-10-17

---

## Summary

A production seed run from an out-of-date copy of the questions puts a corrected answer key back live, with no warning. Before part 2, the release builder refused only part of the same case. Production will use it after the bootstrap (DEBT-483). Before part 1, it could also refuse the correct content after a repair. Part 1 fixes that match and release reuse. Part 2 names changes and returns in both previews, freezes the earlier revision candidates at bootstrap, and requires named returns at activation. Source admission remains. The bootstrap alone does not fix it.

Before part 1, reproduced on 2026-10-17 on a disposable local database, with the public placeholder question; independently repeated with entirely synthetic content through the same seed, builder and activation functions:
- **1–2. Seed and correct.** Seed key A, then the corrected key B: R1 (key A), then R2 (key B), live.
- **3. Stale seed.** Seed the stale file again. The seed prints `updated=1 (new revisions=1)` and puts R3 (key A) live. Nothing warns or refuses.
- **4. Repair.** Seed the correction again: R4 (key B), live.
- **5. Bootstrap.** Bootstrap a release from what is live.
- **6. Correct content refused.** Stage the correct, unchanged content (key B). The builder refuses it as a move "back to an earlier revision". Its unordered `.limit(1)` returned R2, not the live R4, on every run; nothing in the query guarantees that order.
  - Naming it with `--revert` stages R2, so activation would move the live revision from R4 to the identical R2. Learners who answered R4 would then see a spurious "updated" notice.
- **7. Exact stale copy refused.** Stage the stale file exactly as once stored: refused, as designed.
- **8. Edited stale copy accepted.** Stage a stale file with key A and one unrelated edit. The builder stages it as a new revision, and the activation preview lists it under "Update to a newer revision (1)".

**The cause, from first principles.**
- **No enforced source version comes with the input.** The intended authoring source is the content repository. The managed production seed imports a local copy without a commit-bound provenance check. A content hash proves equality, not which source came later.
- **Neither writer establishes source freshness.** The seed compares the file with the live revision only, so a changed file becomes current at the next successful write. This is last-writer-wins behavior, not timestamp-based conflict resolution or proof that the content is newer.
- **The builder's old check compared whole revisions.** A stale key with a change to revision-hashed fields that matched no stored revision could pass. Status/tag-only changes do not alter that hash.
- **Append-only revisions keep a record, not a guard.** They record R3; they do not prevent it.

**What learners see while the stale key is live.** ADR-022 Decision 4 compares the graded revision's key with the current key when deriving score eligibility and notices. It does not regrade the stored answer. For otherwise eligible answers, a regression reverses which key counts:
- **Correct answers are disowned.**
  - Learners who answered the correction (R2) are told "The answer to this question was corrected after you answered". Their attempt is shown ungraded, and the Incorrect filter re-offers the question.
  - The "Practice the corrected question" link opens the stale key.
- **Open sessions turn on correct learners.** In sessions bound to R2, tutor feedback reads "Not scored". It labels the correct answer "Answer before the correction" and withholds its explanation.
- **Old wrong grades count again.** Answers graded on the original key (R1) can count again if the fair-chance and availability rules also allow them. When such an answer is the learner's latest attempt and was stored as correct, the Incorrect practice filter no longer re-offers it.
- **New answers are taught the wrong key.** They are graded on it, and its explanation teaches it.

**What a repair leaves behind.** Seeding the correction again (R4) restores R2's learners, as Decision 4 designs.
- **The window's answers stay on R3.** While the current key differs, they are excluded from scores, with the "corrected" notice.
- **Window sessions take the corrected path.** Sessions bound to R3 show their items "Not scored", label the stale key "Answer before the correction", and withhold its explanation. Tutor sessions have no deadline, so this can last indefinitely.
- **What learners were taught in the window cannot be undone.**
- **Before part 1, the history could block the builder.** The unordered match could refuse correct content (step 6). Requiring `--revert` for an unchanged input encourages unnecessary overrides; no operator behavior was measured.

## Evidence

**The seed:**
- `scripts/seed/question-syncer.ts:257-266` compares the file with the current revision only, and appends a revision when they differ. `scripts/seed/question-revision-writer.ts:77-85` makes it current at once.
- The report is counts only (`scripts/seed/seed-summary.ts`).
- `pnpm db:seed:prod -- --plan` prints only the target database (`scripts/seed-environment-targets.ts:100-103`). There is no content preview.
- The production seed imports `content/drafts/questions` with `--status published` (`scripts/prepare-seed-corpus.ts:24`, `scripts/import-draft-questions.ts:20`). That folder is untracked, and a manual copy refreshes it.
- `pnpm db:seed` reads the configured MDX corpus under `content/questions/` without importing drafts; `imported/` is part of that corpus. Its remote-target acknowledgment is a separate protection from content freshness.
- Each question is its own transaction, so a refusal partway through a run leaves the earlier questions written.
- The checked-in CI seed uses its test database, the Vercel build runs migrations, and `db:seed:all` excludes its resolved production target. This does not prove which commands or direct SQL have run on production. Supported release activation, rollback, holds and withdrawals also change content availability; they must participate in the publication boundary below.

**The builder:**
- `scripts/content-release/release-builder.ts:61-97`: `revisionForContent` now compares canonical fields, preferring the current revision, then the highest revision number. Before part 1, it used an unordered stored-hash match (`92e56929`, lines 57–78); nothing makes `(question, content_hash)` unique.
- `revertedSlugs` (`:347-368`) calls a match a revert when its revision number is below the current one. Part 2b also compares changed keys with activated release items and the frozen bootstrap candidates (`scripts/content-release/release-changes.ts:87-118`).
- A file that matches no revision is appended as new content. Before part 2a, `scripts/content-release/command-support.ts:80-92` at `afba5aa4` printed it under "Update to a newer revision" with no answer-key line. Both previews now name key changes separately.

**The scoring side:**
- `src/domain/services/answer-key.ts:22-28` and `src/adapters/repositories/shared/score-eligibility-sql.ts:95-139` compare each attempt's key with the live revision's key, not with history.
- `components/question/question-update-notice.tsx`, `components/question/ungraded-review.ts` and `components/question/feedback-ungraded.tsx:138-143` hold the notices, the labels and the withheld explanation.
- `src/adapters/repositories/drizzle-practice-session-repository.ts:624-639`: a session binds each question's revision when it starts.

**The documents:** `docs/architecture/content-pipeline.md:56` correctly describes the bare seed's direct input, but `:63,87` incorrectly generalize that drafts are decoupled until a separate manual import. The managed production seed imports them automatically before invoking the bare seed.

**Exposure**, independently remeasured on 2026-10-17 using the app importer/parser and counts only. Historical trees were read with `git archive` in disposable scratch directories; no content-repository files were changed.
- **The four named app clones:** `naltrexone-university`, `-1`, `-2` and `-3`. Each has 948 valid draft questions and 948 valid imported questions. Their answer keys match the content repository's pinned `main` snapshot. The draft content matches the March development snapshot; one non-key question change separates it from that pinned snapshot. This proves agreement with that source, **not** agreement with the unqueried production database.
- **The two source lines differed.** The September merge's first parent is the March 28 main snapshot and its second parent is the March 31 development snapshot. Comparing March main with the pinned snapshot gives 165 different correct-label/text keys, including 93 different correct labels. Of those 165, 163 also changed both stem and explanation. These are content differences, not 165 established clinical errors. The commits and parsing method are pinned in the PR description.
- **Backups remain an exposure.** There are five backup folders in each of the four clones, 20 total. Four per clone fail the current parser for all 948 questions. Each March 31 backup contains 948 valid questions and its question-file bytes match the March main snapshot. Restoring it would supply 165 keys different from the pinned snapshot; the effect on production is unknown until compared with its live keys.
- **History has a boundary.** Migration 0039 introduced revision storage on September 28; append-only writes arrived with `3ac01fc8` on September 30. These are code dates, not verified production migration times. Earlier overwrites cannot be reconstructed from the current revision tables alone.

**History and ownership:**
- DEBT-446 (closed) parked Part 3b on 2026-07-20 because the seed then refused key changes under graded history (BUG-281) and a reseed undid a stale run. `3ac01fc8` removed that refusal, and ADR-022 keeps a stale window's answers out of scores after a repair. Its trigger has not fired, but its premise is gone, so this record takes Part 3b's scope.
- DEBT-492's “none is live” statement concerned its release-only gaps before bootstrap. It did not claim that the direct seed was safe. Its stored-revision check remains incomplete for the cases above.
- BUG-351 owns the stale-input defect, the duplicate-match defect, provenance and the reviewed publication plan. DEBT-531 owns remaining content-comparison and hold-scope decisions. DEBT-483 keeps bootstrap timing and the managed seed's transition.

## Impact

If an older key is clinically wrong, publishing it can teach that answer and suppress correctly graded attempts while the keys differ. The UI says those attempts are ungraded; it does not regrade them as wrong. Restoring the intended key restores eligible earlier scores, but cannot undo what a learner saw.

Production's current keys, source baseline and past seed history were not queried. Current working copies agree with the pinned authoring snapshot, while valid backups differ. Neither “no exposure” nor “production is wrong” follows from those counts. Every future key correction re-creates this exposure in any copy not refreshed from `main`.

P2: a reachable, operator-triggered content regression with a manual workaround: verify a pinned source against live content and review the proposed changes before seeding. The record does not establish a production incident or the clinical validity of either key set.

## Options

1. **Prefer the live revision, name every answer-key change, and admit only forward commits of the content repository's `main`.** *Recommended.* Three small parts, each red first. Parts 1 and 2 are built; part 3 remains proposed below.
2. **Bootstrap first, then the same steps in the builder only.** The seed then refuses production. Choose this if the owner schedules the bootstrap before part 3 ships.
3. **Bootstrap alone (DEBT-483).** This does not establish source freshness. Before part 2, the builder accepted step 8. Before part 1 it also refused step 6.
4. **Process only:**
   - refresh drafts from the content repository's `main` before every production seed;
   - move the 2026-03-31 backups out of `content/drafts/`.

   Do these now as mitigations. They depend on memory, and the next copy or agent repeats the mistake.

### The fix (option 1; parts 1 and 2 built)

**The invariant:** production content moves only forward along the content repository's `main`, and an answer key that a later live revision replaced does not come back without being named.

Each layer has a limit the next one covers:
- **Provenance** refuses a stale copy, whether or not its key was ever stored. It cannot catch a bad edit or merge in a later commit.
- **The key check** flags a return to a key this database once had live. It cannot recognize a wrong key it never stored.
- **The preview** names every changed question, so a person sees what no rule can judge. Clinical correctness is reviewed in the content repository before merge, not at deploy time.

**Part 1. The builder prefers the live revision.** `revisionForContent` matches the current revision first, then the highest revision number, comparing canonical fields recomputed from the stored rows. Stored bytes and hashes stay immutable (DEBT-531). Release reuse must keep the selected revision too.

The v2 manifest names content hashes, not revision IDs (`release-manifest.ts:19,40-42` at `92e56929`). Before part 1, `existingRelease` reused that manifest on the same parent, so an existing stage could substitute R2 for the selected R4. Migration `0048_adr021_hold_lift_and_release_identity.sql` makes that manifest and parent unique. Part 1 introduced v3 manifests that also name each selected revision ID; it still reads and verifies v2 releases for activation and rollback. Existing manifests, items and hashes stay immutable. `content-release-revision-matching.integration.test.ts` reproduces the collision with a previously staged older duplicate.

**Part 1's interim limit.** The revert check still compares only the matched revision's number with the current one. Picking the newest match lets one stale copy through that the unordered match used to refuse:
1. Before the bootstrap: R1 (key A), R2 (key B), then R3 (key A), live.
2. After the bootstrap, a repair staged with `--revert` makes R2 current.
3. A stale file with key A now matches R3, which is newer than R2, so it stages as "Update to a newer revision".

This needs an active release, so production cannot reach it before the bootstrap. Part 2's key-return check closes it, because key A was live in the bootstrap release; `content-release-key-returns.integration.test.ts` refuses this case, and it fails with part 1's revert check alone. Do not bootstrap before part 2 ships; part 2 also captures the pre-bootstrap history the check needs.

**Part 2. The previews name answer-key changes.**
- Built in part 2a: the stage and activation previews list each changed question by kind, with answer-key changes listed separately. The comparison uses the correct choice's label and text, canonicalized as the seed canonicalizes content (`scripts/content-release/release-changes.ts`). Activation binds the key-change list to its existing plan id, so a hold lift cannot change that advice after preview. Staging reads the same classification without changing availability.
- A change whose key equals an earlier live key of the same question must be named with `--revert`, with a reason and authority on the existing activation receipt (DEBT-490). A repair after a regression, and a deliberate return to an earlier key, go the same way. Activation recomputes returns under the pointer lock and binds them to its plan. Rollbacks and hold lifts that return a key need explicit names too. This supersedes DEBT-492's rollback exemption for key returns; its revision-number staging rule remains.
- The bootstrap freezes every stored revision ID in a separate `preBootstrapCandidates` manifest list. It captures that list in its own transaction under the release-pointer lock. The list is part of the manifest hash and therefore the DEBT-489 plan id: a changed candidate set requires a new preview. It is never a release item, so activation and rollback cannot publish it.
- After the bootstrap, the return guard uses revisions in activated releases plus that frozen list. Before the bootstrap, any stored revision is only a candidate, because a draft seed stores one and publishes nothing. Later draft-only and never-activated staged revisions do not enter the list. The existing regression test below remains required.
- **Part 2's limit.** Returns are checked only where an item's key differs from the question's current revision.
  - **The path it misses:** before the bootstrap, a bare seed of a stale file marked `draft` makes the stale key current and unpublishes the question; the managed seed forces `published`, so only the bare seed reaches this.
  - **What happens:** the bootstrap leaves that question out, and a later release that publishes it lists a "Publish" with no key change.
  - **What closes it:** part 3, since staging then reads only forward commits of `main`, never a stale copy. Until then, the rule below applies: seed production only from a refreshed copy of that pinned commit.

**Part 3. Read a commit, not a copy.**
- Staging reads `git archive <commit>` of the content repository's `main`, never the drafts folder, and records the commit in the release manifest. The content repository's SPEC-007 already proposes `corpus_commit`. ADR-021 is amended.
- One row holds the highest admitted commit: the watermark. Staging and activation refuse a commit that is off `main`'s first-parent history, or that does not descend from the watermark.
- The check runs under the release-pointer lock, in the transaction that advances the watermark. The database cannot evaluate Git ancestry itself, so this is check-then-write under a lock: compare-and-set (Kleppmann, *Designing Data-Intensive Applications*, ch. 7, "Preventing Lost Updates").
- A rollback to an earlier release leaves the watermark alone, so a stale copy does not become admissible again. A rewritten `main` needs an owner reset.
- A release staged before this change has no commit; it can be activated only as a rollback.
- The bootstrap records the commit verified against live content as the first watermark, and the existing guard then retires the direct seed for production.
- This is the deployment pipeline's discipline: production receives only what was built from a known commit (Humble and Farley, *Continuous Delivery*).

**Concurrency.** Keep DEBT-489's plan id, which activation already recomputes under its locks (`release-activation.ts:422-444`), and add the source commit to it. This is Fowler's Optimistic Offline Lock. No separate generation counter: the plan binds immutable revision pairs and the key-change and key-return lists. Returning the pointer to an earlier release can still change the return list, so the old preview must be repeated.

**If the seed must write production before the bootstrap:** admit the commit (advance the watermark under the pointer lock) before any write, check each per-question transaction against the admitted commit, and finish an interrupted run by rerunning the same commit. Questions already written match and are skipped. No receipts table.

**Order.** Ship parts 1, 2 and 3 in that order, each red first, and do not call freshness solved before part 3. Correct `docs/architecture/content-pipeline.md` with part 3: until then, the managed seed imports the drafts; the source is the content repository's `main`.

**Red first:**
- After A→B→A→B, staging the live content B is unchanged, not a revert (step 6).
- A stale key with an unrelated edit shows in the preview as a return to an earlier key, and activation needs it named (step 8). A named return, and a later repair, record their decisions.
- After the bootstrap, a draft-only seed or a never-activated staged revision does not count as published.
- Staging or activating a commit off `main`'s first-parent history, or not descended from the watermark, is refused. A rollback does not lower the watermark.
- A release with no commit activates only as a rollback.
- An interrupted pre-bootstrap seed finishes by rerunning the same commit.

## Resolution (proposed)

**Owner, due 2026-10-24:** compare production's published current keys with one pinned commit on the content repository's `main`, in a read-only transaction, emitting counts of missing, extra and differing keys. Engineering makes no remote database connection. Run the key-return census below once, as a second check. A mismatch needs investigation, not an automatic verdict.

**Until the fix ships:** seed production only from a copy refreshed from that pinned commit, and review the changes against live content. Move each clone's March 31 backup out of `content/drafts/`; that is the owner's call.

**Engineering:** parts 1 and 2 are built and tested. Part 3 remains, red first, with ADR-021's amendment and the content repository's SPEC-007 change. Use option 2's order if the owner schedules the bootstrap first (DEBT-483).

## Verification

- [ ] The owner's pinned-source comparison is recorded here as counts, noting that history before 2026-09-30 is incomplete.
- [x] Part 1: `tests/integration/content-release-revision-matching.integration.test.ts` proves A→B→A→B keeps the live revision, newest-match fallback, canonical comparison, release reuse and v2 activation/rollback. The regression, fallback, canonical-match and release-identity cases failed before their fixes.
- [x] Parts 1 and 2 reach production: promotion #1573, live 2026-10-19 21:26Z. Part 3 still needs its own proofs.
- [x] Part 2a: `content-release-key-preview.integration.test.ts` proves both previews name canonical answer-key changes, staging lists each change by kind without publishing it, and a hold lift that changes key advice invalidates the reviewed plan. All six cases failed before the fix.
- [x] Part 2b prerequisite: `content-release-bootstrap-candidates.integration.test.ts` proves the frozen candidate list is captured under the pointer lock, bound to the reviewed plan, and separate from activation and rollback items. All seven cases failed before the fix. V2/v3 canonical hashes, activation and rollback remain tested.
- [x] Part 2b: `content-release-key-returns.integration.test.ts` proves named returns and repairs, activation refusal, later draft/stage exclusion, legacy-history limits, stale-plan refusal, and explicit rollback and hold-lift decisions. The first twelve cases failed before the guard. Canonical history and same-key command forwarding have additional negative controls.
- [ ] Part 3: staging reads a commit of `main`; a commit that does not descend from the watermark is refused; a rollback does not lower it.
- [ ] `docs/architecture/content-pipeline.md` describes the implemented input.
- [ ] The owner runs the **key-return census** once, as a second check: with an explicit authorized `DATABASE_URL`, `pnpm exec tsx scripts/content-release/census-key-returns.ts`. In one read-only, repeatable-read transaction it counts revisions whose answer key changed from the one before and matches an earlier revision's. The key is ADR-022's, each correct choice's exact label and normalized text, as every score and release comparison reads it, so a difference only in spacing neither hides a return nor makes one. It prints only counts. It does not establish publication order, clinical error or an incident.
  - Staged revisions and repairs count. Re-activating an old revision creates no revision and can be missed. History predating append-only storage is incomplete. Published-current and answered-attempt counts narrow the candidates; an attempt proves use, not that its key was clinically wrong.
  - `content-key-return-census.integration.test.ts` proves it on real Postgres: a corrected key that returns, one whose stored text differs only in spacing, a correct answer that moves back to its earlier label, a spacing-only change that is not a return, and malformed keys. A raw-text comparison failed both spacing cases.
  - Corrected 2026-10-19: this item gave inline SQL that compared raw text, which can miss a return differing only in spacing; the tested census replaces it.

## Related

- DEBT-531: the two content writers' different rules; this record's planner is its first piece.
- DEBT-483 (Waiting): the production content bootstrap, which waits for the owner's live-key check.
- DEBT-446 (closed): parked Part 3b, whose scope this record takes.
- DEBT-492 (closed): the builder's revert refusal.
- ADR-021 and ADR-022 Decision 4: revisions, releases and key correction.
