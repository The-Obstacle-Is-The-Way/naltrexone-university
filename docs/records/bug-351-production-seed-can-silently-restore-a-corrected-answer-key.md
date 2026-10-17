# BUG-351: The Production Seed Can Silently Restore a Corrected Answer Key, and the Release Builder's Guard Misses Part of the Same Case

**Status:** Open — owner compares live keys with a pinned content-main commit; due 2026-10-24. Proposed planner and provenance rules need implementation and the stated decision amendments
**Priority:** P2
**Date:** 2026-10-17

---

Corrected 2026-10-17: bounded the exposure claim, distinguished stored revisions from publication history, corrected the diagnostic query, and replaced the incomplete ordering and resume design.

## Summary

A production seed run from an out-of-date copy of the questions puts a corrected answer key back live, with no warning. The release builder, which production will use after the bootstrap (DEBT-483), refuses only part of the same case. It can also refuse the correct content after a repair. So the bootstrap alone does not fix this.

Reproduced on 2026-10-17 on a disposable local database, with the public placeholder question; independently repeated with entirely synthetic content through the same seed, builder and activation functions:
- **1–2. Seed and correct.** Seed key A, then the corrected key B: R1 (key A), then R2 (key B), live.
- **3. Stale seed.** Seed the stale file again. The seed prints `updated=1 (new revisions=1)` and puts R3 (key A) live. Nothing warns or refuses.
- **4. Repair.** Seed the correction again: R4 (key B), live.
- **5. Bootstrap.** Bootstrap a release from what is live.
- **6. Correct content refused.** Stage the correct, unchanged content (key B). The builder refuses it as a move "back to an earlier revision". Its unordered `.limit(1)` returned R2, not the live R4, in the reproduction. With no ordering, that choice is not guaranteed.
  - Naming it with `--revert` stages R2, so activation would move the live revision from R4 to the identical R2. Learners who answered R4 would then see a spurious "updated" notice.
- **7. Exact stale copy refused.** Stage the stale file exactly as once stored: refused, as designed.
- **8. Edited stale copy accepted.** Stage a stale file with key A and one unrelated edit. The builder stages it as a new revision, and the activation preview lists it under "Update to a newer revision (1)".

**The cause, from first principles.**
- **No enforced source version comes with the input.** The intended authoring source is the content repository. The managed production seed imports a local copy without a commit-bound provenance check. A content hash proves equality, not which source came later.
- **Neither writer establishes source freshness.** The seed compares the file with the live revision only, so a changed file becomes current at the next successful write. This is last-writer-wins behavior, not timestamp-based conflict resolution or proof that the content is newer.
- **The builder sees only stored revisions.** It also asks whether the file equals a stored revision, so a stale key with a change to revision-hashed fields that matches no stored revision can pass. Status/tag-only changes do not alter that hash.
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
- **The history can now block the builder.** The unordered match can refuse correct content (step 6). Requiring `--revert` for an unchanged input encourages unnecessary overrides; no operator behavior was measured.

## Evidence

**The seed:**
- `scripts/seed/question-syncer.ts:257-266` compares the file with the current revision only, and appends a revision when they differ. `scripts/seed/question-revision-writer.ts:74-82` makes it current at once.
- The report is counts only (`scripts/seed/seed-summary.ts`).
- `pnpm db:seed:prod -- --plan` prints only the target database (`scripts/seed-environment-targets.ts:100-103`). There is no content preview.
- The production seed imports `content/drafts/questions` with `--status published` (`scripts/prepare-seed-corpus.ts:24`, `scripts/import-draft-questions.ts:20`). That folder is untracked, and a manual copy refreshes it.
- `pnpm db:seed` reads the configured MDX corpus under `content/questions/` without importing drafts; `imported/` is part of that corpus. Its remote-target acknowledgment is a separate protection from content freshness.
- Each question is its own transaction, so a refusal partway through a run leaves the earlier questions written.
- The checked-in CI seed uses its test database, the Vercel build runs migrations, and `db:seed:all` excludes its resolved production target. This does not prove which commands or direct SQL have run on production. Supported release activation, rollback, holds and withdrawals also change content availability; they must participate in the publication boundary below.

**The builder:**
- `scripts/content-release/release-builder.ts:57-78`: `revisionForContent` matches a file to a revision by stored hash, `.limit(1)` with no order (`:76`), and nothing makes `(question, content_hash)` unique.
- `revertedSlugs` (`:300-321`) calls a match a revert when its revision number is below the current one.
- A file that matches no revision is appended as new content. `scripts/content-release/command-support.ts:80-92` prints it under "Update to a newer revision"; no plan line names an answer-key change.

**The scoring side:**
- `src/domain/services/answer-key.ts:22-28` and `src/adapters/repositories/shared/score-eligibility-sql.ts:95-139` compare each attempt's key with the live revision's key, not with history.
- `components/question/question-update-notice.tsx`, `components/question/ungraded-review.ts` and `components/question/feedback-ungraded.tsx:138-143` hold the notices, the labels and the withheld explanation.
- `src/adapters/repositories/drizzle-practice-session-repository.ts:624-639`: a session binds each question's revision when it starts.

**The documents:** `docs/architecture/content-pipeline.md:56` correctly describes the bare seed's direct input, but `:63,87` incorrectly generalize that drafts are decoupled until a separate manual import. The managed production seed imports them automatically before invoking the bare seed.

**Exposure**, independently remeasured on 2026-10-17 using the app importer/parser and counts only. Historical trees were read with `git archive` in disposable scratch directories; no content-repository files were changed.
- **The four named app clones:** `naltrexone-university`, `-1`, `-2` and `-3`. Each has 948 valid draft questions and 948 valid imported questions. Their answer keys match the pinned content-main snapshot used for this review. The draft content matches the March development snapshot; one non-key question change separates it from the review snapshot. This proves agreement with that source, **not** agreement with the unqueried production database.
- **The two source lines differed.** The September merge's first parent is the March 28 main snapshot and its second parent is the March 31 development snapshot. Comparing March main with the review snapshot gives 165 different correct-label/text keys, including 93 different correct labels. Of those 165, 163 also changed both stem and explanation. These are content differences, not 165 established clinical errors. The commits and parsing method are pinned in the PR description.
- **Backups remain an exposure.** There are five backup folders in each of the four clones, 20 total. Four per clone fail the current parser for all 948 questions. Each March 31 backup contains 948 valid questions and its question-file bytes match the March main snapshot. Restoring it would supply 165 keys different from the review snapshot; the effect on production is unknown until compared with its live keys.
- **History has a boundary.** Migration 0039 introduced revision storage on September 28; append-only writes arrived with `3ac01fc8` on September 30. These are code dates, not verified production migration times. Earlier overwrites cannot be reconstructed from the current revision tables alone.

**History and ownership:**
- DEBT-446 Part 3b parked planning and freshness machinery until a recorded stale-clone overwrite or a second independent source writer. A local reproduction proves reachability, not a production incident. The seed and builder are mutually exclusive on a database with an active release; two programs alone do not establish that second trigger. Reopening the parked scope therefore needs an explicit owner amendment, justified by this reproduction and the later scoring rules.
- DEBT-492's “none is live” statement concerned its release-only gaps before bootstrap. It did not claim that the direct seed was safe. Its stored-revision check remains incomplete for the cases above.
- BUG-351 owns the stale-input defect, duplicate-match defect, provenance and reviewed publication plan. DEBT-531 owns remaining content-comparison and hold-scope decisions. DEBT-483 keeps bootstrap timing and the managed seed's transition.

## Impact

If an older key is clinically wrong, publishing it can teach that answer and suppress correctly graded attempts while the keys differ. The UI says those attempts are ungraded; it does not regrade them as wrong. Restoring the intended key restores eligible earlier scores, but cannot undo what a learner saw.

Production's current keys, source baseline and past seed history were not queried. Current working copies agree with the pinned authoring snapshot, while valid backups differ. Neither “no exposure” nor “production is wrong” follows from those counts.

P2: a reachable, operator-triggered content regression with a manual workaround: verify a pinned source against live content and review the proposed changes before seeding. The record does not establish a production incident or the clinical validity of either key set.

## Options

1. **Make content move only forward along the source's history, guard answer keys separately, and plan before applying.** *Recommended.* Both writers call one planner. The design is below; nothing is built.
2. **The same planner in the builder only.** Bootstrap, then make the seed refuse production outright. Choose this if the owner schedules the bootstrap before the fix ships; it skips plan-then-apply for a path the bootstrap retires.
3. **Bootstrap alone (DEBT-483).** This does not fix the bug: the builder accepts step 8 and refuses step 6.
4. **Process only:**
   - refresh drafts from the content repository's `main` before every production seed;
   - move the 2026-03-31 backups out of `content/drafts/`.

   Do these now as mitigations. They depend on memory, and the next copy or agent repeats the mistake.

### The fix (option 1, proposed, not built)

**The invariant:** source admission is ordered and content publication applies only a reviewed plan against the state it reviewed. A previously replaced key requires explicit review before returning. This is a syntactic warning about a possible regression, not a clinical verdict: a stem correction, repaired mistake or deliberate return can legitimately restore an earlier key.

The layers cover different failures:
- **Provenance** rejects unversioned inputs and source snapshots older than the admitted baseline. It cannot detect an erroneous edit or bad merge in a later commit, or prove that the initial baseline was correct.
- **Key-history checks** flag known returns. A stale key never published in this database, or changed enough to be a new key, can evade that check.
- **Review** covers every material content change, including stems, distractors and explanations with an unchanged correct-label/text key. Reviewing only key changes leaves those regressions unexamined. No layer proves clinical correctness.

**1. Read an immutable source and preserve its order.**
- Read a named content-main commit with `git archive`; bind its repository identity, full commit, input manifest and importer/canonicalization versions. Local drafts remain an authoring input, not a production admission artifact. Exercise the same admission implementation in tests using a synthetic local Git repository and local database; no production-only switch may bypass it in tests.
- Pin the main tip used for validation. Require both the admitted baseline and candidate on that tip's first-parent chain, and require the candidate to be at or after the baseline on that chain. A second-parent feature commit becomes admissible through its reviewed merge result. First-parent traversal orders one fixed lineage; it is not a semantic freshness guarantee, and a moved or rewritten branch must not silently redefine the baseline.
- Record source admission separately from what is currently published. A reviewed rollback under ADR-021 may publish an earlier release, but must not lower the admission watermark and make stale writers admissible again. Prefer a new descendant commit for a source repair; a lineage reset needs an explicit owner decision.
- Establish the initial baseline by comparing a pinned source with live content. Do not label existing rows with a guessed source commit. An empty or unprovable history cannot safely supply an ancestry check.
- This follows the reproducible-artifact discipline in Humble and Farley's *Continuous Delivery*, chapter 5, [Deployment Pipeline patterns](https://continuousdelivery.com/implementing/patterns/). A Git hash is **not** a fencing token. Kleppmann's [fencing example](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) requires an increasing token checked by the resource on every write. Here, use database transactions and a monotonic content generation for concurrency; use Git ancestry for source admission.
- Amend ADR-021's admission contract and coordinate the content repository's SPEC-007, which already proposes `corpus_commit` and `input_manifest_hash`; do not claim those fields are absent or implemented today.

**2. One classifier, with publication facts supplied by adapters.**
- A pure classifier takes canonical incoming fields, current state and evidenced publication history. It returns content outcomes (insert, unchanged, forward edit, prior-content return), key-change/possible-regression flags, and separate availability conflicts. A key regression can also be a forward edit; these are not exclusive cases.
- The seed and builder use it. Activation rechecks the relevant rules, including releases staged before the fix and explicit rollbacks. Testing only staging leaves those publication paths outside the guard.
- Prefer the current revision when canonical content is equal, then match other revisions deterministically. Equality does not authorize status/tag changes or override a withdrawal. Preserve immutable stored bytes and hashes; canonical comparison is derived data. DEBT-531 owns whether scoring's raw key comparison should change, through ADR-022.
- Do not infer “was published” from “the seed wrote it,” a current pointer, or membership in an activated release. Seeds write drafts and archives (`question-syncer.ts:167-193,265-279`); staging creates a draft with a current pointer (`release-builder.ts:196-217`); activation excludes held and withdrawn members (`release-activation.ts:502-530`). A synthetic draft seed stored one revision while publishing zero questions.
- Record actual eligible publication transitions and their order at the write boundary, including rollback and hold/lift effects. Revision creation numbers are not publication order. Preserve uncertainty about earlier history; use a reviewed baseline and treat unproven historical matches as review candidates rather than known live regressions.
- Compare correct labels/text after the seed's canonicalization for the warning. A named return records the reviewed changes, reason and authority. It permits a legitimate repair; it cannot revive a permanent withdrawal. Retired or held content follows its distinct policy, with the ADR-021/022 hold decision left to DEBT-531.

**3. Bind planning and application to one state.**
- The plan binds source identity, all input hashes, tool/contract versions, target database identity, the active release and monotonic content generation, current revision/status/overlay inputs, and the full proposed result. The operator reviews material changes privately; public logs and PR receipts contain counts only. Approvals for returns bind to this exact plan.
- Read a consistent snapshot for planning. At apply, take the existing release-pointer lock, revalidate the generation and all admission/eligibility conditions, and commit the check and write together. Advance the generation on every supported mutation that can change the plan, including withdrawal, hold/lift and rollback, so a change away and back cannot look unchanged.
- This is [Optimistic Offline Lock](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html) (*Patterns of Enterprise Application Architecture*, chapter 16), with compare-and-set as discussed in *Designing Data-Intensive Applications*, **first edition**, chapter 7, “Preventing Lost Updates.” A pointer comparison alone does not prove that no intervening change occurred.
- **Release path:** preserve ADR-021's atomic activation and the existing staging transaction. Do not replace these with per-question commits. DEBT-489's plan already binds manifest/parent, prior active release and publication/removal sets (`release-activation.ts:450-481`); source provenance and generation extend it, rather than duplicating it. Staging must account for its existing live tag writes (DEBT-531).
- **Direct seed, if it remains:** preflight predictable refusals before the first write. Its existing per-question commit model can still stop after partial progress because of a concurrent change or database failure. Keep a durable active-plan identity and per-question completion receipts, checked under the pointer lock; reject competing applies and bootstrap until that plan completes or an explicit reconciliation abandons it. Resume skips only a matching receipt whose post-state still holds, never arbitrary “unchanged” content. Advance the source watermark only when the complete plan finishes. A resumed plan encountering foreign changes must stop for a new review.
- A single seed transaction would avoid partial progress but hold question-row locks across the corpus; DEBT-492 proves the analogous staging lock can block session starts. Measure that alternative before selecting it. If the owner can retire the direct writer before shipping this fix, option 2 avoids inventing a second resumable publication mechanism. Neither option is complete without the shared admission and activation checks.

**4. Correct the content pipeline document with implementation.**
- Distinguish bare MDX seeding from the managed command's automatic draft import.
- Name the pinned content-main source and the admission contract.
- Explain the review plan, rollback, partial-apply boundary if retained, and the uncertain historical baseline.

**Red first, through the actual writer and activation functions:**
- A→B→A is flagged before writes; an authorized return and a subsequent legitimate repair work and record their decisions.
- Current canonical content after A→B→A→B is unchanged despite duplicate historical revisions.
- A stale key with unrelated edits is flagged when evidenced in publication history. A new key and a stem-only regression both appear for review, without claiming automatic clinical detection.
- Draft-only, archive-only and never-published staged revisions cannot become false evidence of an earlier publication. Held members of activated releases are excluded too.
- The same classifier cases run through both writers. Published, retired, held and withdrawn states keep distinct rules.
- Source candidates before the baseline, off the pinned first-parent chain, and after a lineage rewrite that removes the admitted baseline from the pinned first-parent chain are refused. A reviewed rollback does not rewind source admission. Initial migration requires the reviewed baseline.
- A plan is rejected after an intervening revision, status, tag, withdrawal, hold/lift or rollback, including a change away and back. Test a previously staged release at activation.
- Failure before writes leaves no writes; failure after some direct-seed commits is reported as partial. A same-plan resume uses receipts, refuses foreign changes and excludes a competing plan or bootstrap. Release activation remains atomic.

## Resolution (proposed)

**Owner, due 2026-10-24:** compare production's published current keys with one pinned commit on the content repository's `main`, in a read-only transaction, emitting counts of missing, extra and differing keys. Include the source commit and content generation/active-release identity if available in the private receipt. This review makes no remote database connection.

Run the diagnostic below as a separate historical check. A mismatch needs investigation, not an automatic new record per question or a clinical verdict. Keep findings here until a distinct defect warrants its own owner.

Before any production seed, verify and refresh drafts from the intended pinned main snapshot and review the changes against live content. Move each March 31 backup out of `content/drafts/` only with its owner's direction; this review changes none of them.

**Engineering after the required decisions:** obtain the explicit DEBT-446 Part 3b amendment and agree the ADR-021/SPEC-007 admission change. Select option 1 or 2 with the owner based on bootstrap timing (DEBT-483). Implement the shared classifier, admission, publication revalidation and review plan as one coherent production path, red first. Do not ship only a key-history guard while calling freshness solved.

## Verification

- [ ] The owner's pinned-source comparison is recorded as counts, with unknown historical provenance stated.
- [ ] DEBT-446's amendment and ADR-021/SPEC-007 coordination are recorded; bootstrap timing stays the owner's decision under DEBT-483.
- [ ] The shared cases above pass through real seed/builder/activation paths on a disposable local database, including explicit repairs and rollback.
- [ ] Admission cannot move backward, and publication cannot apply a stale reviewed plan.
- [ ] The selected transaction/resume design is proved under concurrent changes and injected failures.
- [ ] `docs/architecture/content-pipeline.md` describes the implemented input and publication paths.
- [ ] The owner runs this **candidate-recurrence diagnostic** once. It compares raw correct-label/text keys in revision-creation order, matching ADR-022's fields. It does not establish publication order, clinical error or an incident.
  - Staged revisions and repairs count. Re-activating an old revision creates no revision and can be missed. History predating append-only storage is incomplete. Published-current and answered-attempt counts narrow the candidates; an attempt proves use, not that its key was clinically wrong.
  - The synthetic regression/repair/staged-copy case returns 3 candidates, 1 question, 1 published current candidate, 0 bound attempts, 0 answered attempts and 0 malformed keys. The third candidate was never activated.

  ```sql
  begin transaction isolation level repeatable read read only;
  with keyed as (
    select r.id, r.question_id, r.revision_number,
      count(c.id) filter (where c.is_correct) as key_choices,
      coalesce(jsonb_agg(jsonb_build_array(c.label, c.text_md)
        order by c.label, c.text_md) filter (where c.is_correct), '[]'::jsonb) as answer_key
    from question_revisions r
    left join choices c on c.question_revision_id = r.id
    group by r.id, r.question_id, r.revision_number
  ), stepped as (
    select *,
      lag(answer_key) over (partition by question_id order by revision_number) as previous_key,
      lag(key_choices) over (partition by question_id order by revision_number) as previous_key_choices
    from keyed
  ), candidates as (
    select s.id, s.question_id from stepped s
    where s.key_choices = 1 and s.previous_key_choices = 1
      and s.previous_key <> s.answer_key
      and exists (
        select 1 from keyed k
        where k.question_id = s.question_id
          and k.revision_number < s.revision_number
          and k.key_choices = 1 and k.answer_key = s.answer_key
      )
  )
  select
    (select count(*) from candidates) as candidate_revisions,
    (select count(distinct question_id) from candidates) as questions,
    (select count(*) from candidates c join questions q on q.current_revision_id = c.id
      where q.status = 'published') as published_current_candidates,
    (select count(*) from attempts a where a.question_revision_id in (select id from candidates)) as attempts_bound,
    (select count(*) from attempts a where a.selected_choice_id is not null
      and a.question_revision_id in (select id from candidates)) as answered_attempts_bound,
    (select count(*) from keyed where key_choices <> 1) as malformed_key_revisions;
  rollback;
  ```

## Related

- DEBT-531: the two content writers' different rules; this record's planner is its first piece.
- DEBT-483 (Waiting): the production content bootstrap, which waits for the owner's live-key check.
- DEBT-446 and DEBT-492 (closed): the parked freshness check, and the builder's revert refusal.
- ADR-021 and ADR-022 Decision 4: revisions, releases and key correction.
